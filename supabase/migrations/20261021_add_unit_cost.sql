-- ============================================================
-- WINGTRACK: Add unit_cost to products and order_items
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================

-- 1. Add unit_cost to products table for storing menu item cost price
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0);

COMMENT ON COLUMN public.products.unit_cost IS 'Cost price (unit cost) of the menu item for profit margin calculation.';

-- 2. Add unit_cost to order_items table for capturing historical cost at time of checkout
ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0);

COMMENT ON COLUMN public.order_items.unit_cost IS 'Historical unit cost of the item captured at the time of order checkout.';

-- 3. Update create_order RPC function to store unit_cost into order_items
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
    INSERT INTO public.orders (
        cashier_id, status, payment_method,
        subtotal, vat_amount, total_amount, notes
    )
    VALUES (
        p_cashier_id, 'completed', p_payment_method::public.payment_method,
        p_subtotal, p_vat_amount, p_total_amount, p_notes
    )
    RETURNING orders.id, orders.order_number INTO v_order_id, v_order_number;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, unit_cost, quantity
        )
        VALUES (
            v_order_id,
            (v_item->>'product_id')::uuid,
            v_item->>'product_name',
            (v_item->>'unit_price')::numeric,
            COALESCE((v_item->>'unit_cost')::numeric, 0),
            (v_item->>'quantity')::integer
        );
    END LOOP;

    FOR v_ded IN SELECT * FROM jsonb_array_elements(p_deductions)
    LOOP
        v_deduct_qty := (v_ded->>'qty')::numeric;
        IF v_deduct_qty IS NULL OR v_deduct_qty = 0 THEN
            CONTINUE;
        END IF;

        SELECT stock_qty INTO v_current_qty
        FROM public.inventory
        WHERE id = (v_ded->>'inventory_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Inventory item % not found', v_ded->>'inventory_id';
        END IF;

        IF v_current_qty < v_deduct_qty THEN
            RAISE EXCEPTION 'Insufficient stock for %: need %, have %',
                v_ded->>'inventory_id', v_deduct_qty, v_current_qty;
        END IF;

        v_new_qty := GREATEST(0, v_current_qty - v_deduct_qty);

        UPDATE public.inventory
        SET stock_qty = v_new_qty
        WHERE id = (v_ded->>'inventory_id')::uuid;

        INSERT INTO public.inventory_movements (
            inventory_id, order_id, movement_type,
            qty_change, qty_before, qty_after,
            performed_by, notes
        )
        VALUES (
            (v_ded->>'inventory_id')::uuid,
            v_order_id,
            'deduction'::public.inventory_movement_type,
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

