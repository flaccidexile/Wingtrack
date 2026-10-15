-- ============================================================
-- WINGTRACK — ALL MIGRATIONS, IN ORDER
-- ============================================================
--
-- Paste this entire file into the Supabase dashboard → SQL Editor → Run.
--
-- It is the concatenation of every dated migration in supabase/migrations/,
-- in dependency order, so a single paste brings a project fully up to date.
-- Every statement is idempotent and safe to run more than once.
--
-- Regenerate after adding a migration:
--   cat supabase/migrations/*.sql > supabase/RUN_ALL_MIGRATIONS.sql
--
-- The file is also referenced from schema.sql, which remains the canonical
-- definition for a brand-new database.
--

-- ############################################################
-- ##  migrations/20261010_create_order.sql
-- ############################################################

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

-- ############################################################
-- ##  migrations/20261010_login_otps.sql
-- ############################################################

-- ============================================================
-- Migration: login one-time codes for OTP sign-in
-- ============================================================
--
-- Apply this in the Supabase dashboard → SQL Editor → Run.
-- It is idempotent and safe to run more than once.
--
-- WHY
-- ---
-- Supabase's built-in mailer refuses to deliver to anyone outside the project's
-- organisation team and is capped at roughly 2 messages/hour, so emailed login
-- codes silently never reach your staff. With custom SMTP configured the
-- server generates the code itself and mails it directly; this table is where
-- those codes live between being sent and being redeemed.

CREATE TABLE IF NOT EXISTS public.login_otps (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text NOT NULL,
    code_hash   text NOT NULL,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    attempts    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Lookup path: newest live code for an email.
CREATE INDEX IF NOT EXISTS idx_login_otps_email_created
    ON public.login_otps (email, created_at DESC);

-- Codes are only ever read/written by the server using the service-role key.
-- RLS is enabled so the anon and authenticated roles can never read them.
ALTER TABLE public.login_otps ENABLE ROW LEVEL SECURITY;

-- ############################################################
-- ##  migrations/20261011_staff_presence.sql
-- ############################################################

-- ============================================================
-- WINGTRACK: Staff presence, profile enrichment & live monitoring
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================
--
-- Backs three features on the Staff Manager / Settings screens:
--   1. "online now" monitoring (avatar + freshness columns)
--   2. the staff detail panel (last signed in / last seen active)
--   3. realtime updates of the staff list without a manual refresh
--
-- Everything here is additive — no column is dropped, no row is rewritten
-- except the one-time backfill in step 3.

-- ============================================================
-- 1. PROFILE ENRICHMENT + PRESENCE COLUMNS
-- ============================================================
--
-- avatar_url      Public URL of the staff member's photo, served from the
--                 `avatars` Storage bucket. Written by the Express API using
--                 the service-role key, so no Storage RLS policy is required.
--
-- last_seen_at    Stamped by the client heartbeat roughly every 45 seconds
--                 while the app is open. A member counts as "online now" when
--                 this is within the last couple of minutes.
--
-- last_sign_in_at Stamped once per browser session. Distinct from
--                 last_seen_at: it survives sign-out and answers "when did
--                 this person last actually log in?".

ALTER TABLE public.staff_profiles
    ADD COLUMN IF NOT EXISTS avatar_url      TEXT,
    ADD COLUMN IF NOT EXISTS last_seen_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- The Staff Manager sorts and counts on freshness; keep those reads cheap.
CREATE INDEX IF NOT EXISTS idx_staff_last_seen
    ON public.staff_profiles (last_seen_at DESC);

-- ============================================================
-- 2. REALTIME
-- ============================================================
--
-- The Staff Manager subscribes to postgres_changes on this table so a rename,
-- a role change or a deactivation lands in every open admin session without a
-- refresh.
--
-- Realtime still enforces RLS: only the `admin_all_staff` policy grants broad
-- visibility, so non-admins receive nothing from this table. Each user can
-- additionally observe their own row via `self_read_staff`.
--
-- ADD TABLE is not idempotent, hence the guard.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname    = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'staff_profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_profiles;
    END IF;
END $$;

-- ============================================================
-- 3. BACKFILL last_sign_in_at
-- ============================================================
--
-- Accounts provisioned before this migration have no sign-in timestamp of our
-- own. auth.users already records one, so seed from there rather than showing
-- a misleading "Never signed in" for staff who have been logging in for weeks.
--
-- Only fills blanks — an existing value is never overwritten.

UPDATE public.staff_profiles AS sp
SET    last_sign_in_at = u.last_sign_in_at
FROM   auth.users AS u
WHERE  u.id = sp.user_id
  AND  sp.last_sign_in_at IS NULL
  AND  u.last_sign_in_at IS NOT NULL;

-- ============================================================
-- 4. VERIFY
-- ============================================================
-- Expect three new columns and at least one row on the publication.

SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'staff_profiles'
  AND  column_name IN ('avatar_url', 'last_seen_at', 'last_sign_in_at')
ORDER  BY column_name;

SELECT tablename
FROM   pg_publication_tables
WHERE  pubname = 'supabase_realtime'
  AND  schemaname = 'public'
  AND  tablename = 'staff_profiles';

-- ############################################################
-- ##  migrations/20261015_add_product_type.sql
-- ############################################################

-- ============================================================
-- WINGTRACK: Add product_type to products table
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'Regular';

-- Add a comment explaining valid types
COMMENT ON COLUMN public.products.product_type IS 'Product badge type: Regular, Bestseller, New, Seasonal, Special';
