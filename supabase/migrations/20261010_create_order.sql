-- ============================================================
-- Migration: atomic order creation
-- ============================================================
--
-- Apply this in the Supabase dashboard → SQL Editor → Run.
-- It is idempotent and safe to run more than once.
--
-- WHY
-- ---
-- Checkout previously performed four independent writes (order header, line
-- items, stock updates, movement log). A failure after the header insert left
-- a "completed" order with no line items, inflating order counts and corrupting
-- sales analytics; and a failed movement insert left stock changed with no
-- audit record.
--
-- This function does all four inside one transaction. If anything fails, the
-- whole order is rolled back — the API never reports a partial success.
--
-- The server calls this via supabaseAdmin.rpc('create_order', {...}). If the
-- function is missing, the server falls back to sequential writes with
-- compensating cleanup, so the app keeps working before this is applied.

CREATE OR REPLACE FUNCTION public.create_order(
    p_cashier_id     uuid,
    p_payment_method text,
    p_subtotal       numeric,
    p_vat_amount     numeric,
    p_total_amount   numeric,
    p_notes          text,
    p_items          jsonb,
    p_deductions     jsonb
)
RETURNS TABLE (id uuid, order_number integer, deductions_applied integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id     uuid;
    v_order_number integer;
    v_applied      integer := 0;
    v_item         jsonb;
    v_ded          jsonb;
    v_current_qty  numeric;
    v_deduct_qty   numeric;
    v_new_qty      numeric;
BEGIN
    -- ── 1. Order header ──────────────────────────────────────
    --
    -- The ::public.payment_method cast below is load-bearing — do not remove it.
    --
    -- p_payment_method is declared `text`, but orders.payment_method is the
    -- public.payment_method ENUM. PostgreSQL silently coerces an *unknown-typed
    -- literal* into an enum (that is why 'completed' needs no cast), but a value
    -- whose type is already known — like this text parameter — is NOT implicitly
    -- castable to an enum. Without the cast every single call aborts with:
    --
    --     42804  column "payment_method" is of type payment_method
    --            but expression is of type text
    --
    -- which surfaced to cashiers as "Failed to record the order. Nothing was
    -- saved." on every checkout.
    INSERT INTO public.orders (
        cashier_id, status, payment_method,
        subtotal, vat_amount, total_amount, notes
    )
    VALUES (
        p_cashier_id, 'completed', p_payment_method::public.payment_method,
        p_subtotal, p_vat_amount, p_total_amount, p_notes
    )
    RETURNING orders.id, orders.order_number INTO v_order_id, v_order_number;

    -- ── 2. Line items ────────────────────────────────────────
    --
    -- line_total is deliberately absent from this column list: it is a
    -- GENERATED ALWAYS column (unit_price * quantity), and Postgres rejects any
    -- explicit value with:
    --
    --     428C9  column "line_total" can only be updated to DEFAULT
    --
    -- The database computes it. Do not add it back.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, quantity
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::uuid,
            v_item->>'product_name',
            (v_item->>'unit_price')::numeric,
            (v_item->>'quantity')::integer
        );
    END LOOP;

    -- ── 3. Stock deductions + movement log ───────────────────
    FOR v_ded IN SELECT * FROM jsonb_array_elements(p_deductions)
    LOOP
        v_deduct_qty := (v_ded->>'qty')::numeric;
        IF v_deduct_qty IS NULL OR v_deduct_qty = 0 THEN
            CONTINUE;
        END IF;

        -- Lock the row so concurrent sales cannot both read the same stock.
        SELECT stock_qty INTO v_current_qty
        FROM public.inventory
        WHERE inventory.id = (v_ded->>'inventory_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory item % not found', v_ded->>'inventory_id';
        END IF;

        v_new_qty := GREATEST(0, v_current_qty - v_deduct_qty);

        UPDATE public.inventory
        SET stock_qty = v_new_qty
        WHERE inventory.id = (v_ded->>'inventory_id')::uuid;

        INSERT INTO public.inventory_movements (
            inventory_id, order_id, movement_type,
            qty_change, qty_before, qty_after, performed_by, notes
        )
        VALUES (
            (v_ded->>'inventory_id')::uuid,
            v_order_id,
            'deduction',
            -v_deduct_qty,
            v_current_qty,
            v_new_qty,
            p_cashier_id,
            'Auto-deducted for Order #' || v_order_number
        );

        v_applied := v_applied + 1;
    END LOOP;

    RETURN QUERY SELECT v_order_id, v_order_number, v_applied;
END;
$$;

-- Only the server (service-role) needs to execute this. Revoking from the
-- anon/authenticated roles prevents a user from forging orders directly.
REVOKE ALL ON FUNCTION public.create_order(
    uuid, text, numeric, numeric, numeric, text, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
