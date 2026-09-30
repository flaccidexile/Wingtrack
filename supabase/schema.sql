-- ============================================================
-- WINGTRACK: Integrated POS, Inventory & Sales Analytics
-- PostgreSQL DDL — Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================

-- Enable UUID extension (already available in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ENUMS (Safe creation with duplicate checks)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
        CREATE TYPE public.staff_role AS ENUM ('admin', 'cashier', 'inventory_personnel');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
        CREATE TYPE public.order_status AS ENUM ('open', 'completed', 'void');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
        CREATE TYPE public.payment_method AS ENUM ('cash', 'gcash', 'card');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_status') THEN
        CREATE TYPE public.stock_status AS ENUM ('ok', 'low', 'critical');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
        CREATE TYPE public.movement_type AS ENUM ('restock', 'deduction', 'adjustment', 'waste');
    END IF;
END $$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- STAFF PROFILES
-- Linked 1-to-1 with Supabase auth.users via user_id
-- Provisioned exclusively by admin (no public sign-up)
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name      TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    role           public.staff_role NOT NULL DEFAULT 'cashier',
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_by     UUID REFERENCES public.staff_profiles(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRODUCT CATEGORIES
CREATE TABLE IF NOT EXISTS public.product_categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       TEXT NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0
);

-- PRODUCTS (Menu Items)
CREATE TABLE IF NOT EXISTS public.products (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL UNIQUE,
    category_id   UUID NOT NULL REFERENCES public.product_categories(id),
    price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    is_available  BOOLEAN NOT NULL DEFAULT TRUE,
    image_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INVENTORY ITEMS (Raw ingredients / packaging)
CREATE TABLE IF NOT EXISTS public.inventory (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL UNIQUE,
    category        TEXT NOT NULL,
    unit            TEXT NOT NULL,
    stock_qty       NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    min_stock_level NUMERIC(12, 3) NOT NULL DEFAULT 0,
    unit_cost       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    supplier        TEXT,
    status          public.stock_status GENERATED ALWAYS AS (
        CASE
            WHEN stock_qty = 0 THEN 'critical'::public.stock_status
            WHEN stock_qty / NULLIF(min_stock_level, 0) <= 0.6 THEN 'critical'::public.stock_status
            WHEN stock_qty <= min_stock_level THEN 'low'::public.stock_status
            ELSE 'ok'::public.stock_status
        END
    ) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PRODUCT–INGREDIENT RECIPE MAP
-- Defines how much of each inventory item is consumed per unit sold
CREATE TABLE IF NOT EXISTS public.product_recipes (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    inventory_id   UUID NOT NULL REFERENCES public.inventory(id) ON DELETE RESTRICT,
    qty_per_unit   NUMERIC(10, 4) NOT NULL CHECK (qty_per_unit > 0),
    UNIQUE (product_id, inventory_id)
);

-- ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number    SERIAL,
    cashier_id      UUID NOT NULL REFERENCES public.staff_profiles(id),
    status          public.order_status NOT NULL DEFAULT 'open',
    payment_method  public.payment_method NOT NULL DEFAULT 'cash',
    subtotal        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    vat_amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id     UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES public.products(id),
    product_name TEXT NOT NULL,
    unit_price   NUMERIC(10, 2) NOT NULL,
    quantity     INT NOT NULL CHECK (quantity > 0),
    line_total   NUMERIC(10, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED
);

-- INVENTORY MOVEMENT LOG
-- Audit trail for all stock changes
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id     UUID NOT NULL REFERENCES public.inventory(id),
    order_id         UUID REFERENCES public.orders(id),
    movement_type    public.movement_type NOT NULL,
    qty_change       NUMERIC(12, 3) NOT NULL,
    qty_before       NUMERIC(12, 3) NOT NULL,
    qty_after        NUMERIC(12, 3) NOT NULL,
    performed_by     UUID REFERENCES public.staff_profiles(id),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. SEED INITIAL DATA (Idempotent via ON CONFLICT)
-- ============================================================

INSERT INTO public.product_categories (name, sort_order) VALUES
    ('Wings', 1),
    ('Combos', 2),
    ('Sides', 3),
    ('Drinks', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.products (name, category_id, price) VALUES
    ('Classic Buffalo Wings',  (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Honey Garlic Wings',     (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Spicy Sriracha Wings',   (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('BBQ Smokey Wings',       (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Lemon Pepper Wings',     (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('BBQ Combo Platter',      (SELECT id FROM public.product_categories WHERE name='Combos'), 299.00),
    ('Party Bucket (20pcs)',   (SELECT id FROM public.product_categories WHERE name='Combos'), 599.00),
    ('Family Feast Set',       (SELECT id FROM public.product_categories WHERE name='Combos'), 749.00),
    ('Loaded Fries',           (SELECT id FROM public.product_categories WHERE name='Sides'), 80.00),
    ('Coleslaw',               (SELECT id FROM public.product_categories WHERE name='Sides'), 55.00),
    ('Garlic Rice',            (SELECT id FROM public.product_categories WHERE name='Sides'), 45.00),
    ('Corn on the Cob',        (SELECT id FROM public.product_categories WHERE name='Sides'), 60.00),
    ('Iced Tea',               (SELECT id FROM public.product_categories WHERE name='Drinks'), 45.00),
    ('Bottomless Soda',        (SELECT id FROM public.product_categories WHERE name='Drinks'), 65.00),
    ('Mineral Water',          (SELECT id FROM public.product_categories WHERE name='Drinks'), 30.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.inventory (name, category, unit, stock_qty, min_stock_level, unit_cost, supplier) VALUES
    ('Chicken Wings (Raw)',   'Proteins',  'kg',      24.5,  10,   280.00,  'FreshFarm Supply'),
    ('Honey Garlic Sauce',    'Sauces',    'bottles',  8,    12,   185.00,  'Flavor House PH'),
    ('Buffalo Hot Sauce',     'Sauces',    'bottles', 15,    10,   210.00,  'Flavor House PH'),
    ('Sriracha Sauce',        'Sauces',    'bottles',  5,     8,   195.00,  'Flavor House PH'),
    ('Cooking Oil (Palm)',    'Cooking',   'liters',  42,    20,    90.00,  'Metro Grocery'),
    ('Frozen Fries',          'Sides',     'kg',      18,    15,   120.00,  'FreshFarm Supply'),
    ('Garlic (Peeled)',       'Produce',   'kg',       3.2,   5,   160.00,  'Metro Grocery'),
    ('Coleslaw Mix',          'Produce',   'kg',       6,     4,    85.00,  'FreshFarm Supply'),
    ('BBQ Sauce',             'Sauces',    'bottles', 11,    10,   175.00,  'Flavor House PH'),
    ('Lemon Pepper Blend',    'Spices',    'packs',    9,     6,   145.00,  'Spice Central'),
    ('White Rice (Sacks)',    'Staples',   'sacks',    4,     3,  2200.00,  'Metro Grocery'),
    ('Disposable Cups',       'Packaging', 'pcs',    520,   200,     2.50,  'PackPro'),
    ('Take-out Boxes',        'Packaging', 'pcs',    145,   100,     8.00,  'PackPro'),
    ('Napkins (Packs)',       'Packaging', 'packs',   28,    20,    35.00,  'PackPro')
ON CONFLICT (name) DO NOTHING;

-- Seed recipes safely
INSERT INTO public.product_recipes (product_id, inventory_id, qty_per_unit)
SELECT
    p.id,
    i.id,
    v.qty
FROM (VALUES
    ('Classic Buffalo Wings',  'Chicken Wings (Raw)',  0.4),
    ('Classic Buffalo Wings',  'Buffalo Hot Sauce',    0.1),
    ('Classic Buffalo Wings',  'Cooking Oil (Palm)',   0.05),
    ('Classic Buffalo Wings',  'Take-out Boxes',       1),

    ('Honey Garlic Wings',     'Chicken Wings (Raw)',  0.4),
    ('Honey Garlic Wings',     'Honey Garlic Sauce',   0.1),
    ('Honey Garlic Wings',     'Cooking Oil (Palm)',   0.05),
    ('Honey Garlic Wings',     'Take-out Boxes',       1),

    ('Spicy Sriracha Wings',   'Chicken Wings (Raw)',  0.4),
    ('Spicy Sriracha Wings',   'Sriracha Sauce',       0.1),
    ('Spicy Sriracha Wings',   'Cooking Oil (Palm)',   0.05),
    ('Spicy Sriracha Wings',   'Take-out Boxes',       1),

    ('BBQ Smokey Wings',       'Chicken Wings (Raw)',  0.4),
    ('BBQ Smokey Wings',       'BBQ Sauce',            0.1),
    ('BBQ Smokey Wings',       'Cooking Oil (Palm)',   0.05),
    ('BBQ Smokey Wings',       'Take-out Boxes',       1),

    ('Lemon Pepper Wings',     'Chicken Wings (Raw)',  0.4),
    ('Lemon Pepper Wings',     'Lemon Pepper Blend',   0.05),
    ('Lemon Pepper Wings',     'Cooking Oil (Palm)',   0.05),
    ('Lemon Pepper Wings',     'Take-out Boxes',       1),

    ('BBQ Combo Platter',      'Chicken Wings (Raw)',  0.6),
    ('BBQ Combo Platter',      'BBQ Sauce',            0.15),
    ('BBQ Combo Platter',      'Frozen Fries',         0.15),
    ('BBQ Combo Platter',      'Coleslaw Mix',         0.1),
    ('BBQ Combo Platter',      'Cooking Oil (Palm)',   0.1),
    ('BBQ Combo Platter',      'Take-out Boxes',       1),

    ('Party Bucket (20pcs)',   'Chicken Wings (Raw)',  2.0),
    ('Party Bucket (20pcs)',   'Cooking Oil (Palm)',   0.3),
    ('Party Bucket (20pcs)',   'Take-out Boxes',       2),

    ('Family Feast Set',       'Chicken Wings (Raw)',  2.0),
    ('Family Feast Set',       'BBQ Sauce',            0.2),
    ('Family Feast Set',       'Frozen Fries',         0.3),
    ('Family Feast Set',       'White Rice (Sacks)',   0.05),
    ('Family Feast Set',       'Cooking Oil (Palm)',   0.2),
    ('Family Feast Set',       'Take-out Boxes',       2),

    ('Loaded Fries',           'Frozen Fries',         0.25),
    ('Loaded Fries',           'Cooking Oil (Palm)',   0.05),
    ('Loaded Fries',           'Take-out Boxes',       1),

    ('Coleslaw',               'Coleslaw Mix',         0.15),
    ('Garlic Rice',            'White Rice (Sacks)',   0.02),
    ('Garlic Rice',            'Garlic (Peeled)',      0.02),
    ('Garlic Rice',            'Cooking Oil (Palm)',   0.01),

    ('Iced Tea',               'Disposable Cups',      1),
    ('Bottomless Soda',        'Disposable Cups',      1),
    ('Mineral Water',          'Disposable Cups',      1)
) AS v(product_name, inventory_name, qty)
JOIN public.products p ON p.name = v.product_name
JOIN public.inventory i ON i.name = v.inventory_name
ON CONFLICT (product_id, inventory_id) DO NOTHING;

-- ============================================================
-- 4. HELPER FUNCTIONS & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_updated_at ON public.staff_profiles;
CREATE TRIGGER trg_staff_updated_at BEFORE UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON public.inventory;
CREATE TRIGGER trg_inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 5. HARDENED SECURITY DEFINER FUNCTION
-- Fixed search_path = '' and fully qualified names to prevent hijack attacks
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.staff_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.staff_profiles WHERE user_id = (SELECT auth.uid());
$$;

-- ============================================================
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.staff_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recipes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items          ENABLE ROW LEVEL SECURITY;

-- ---- staff_profiles ----
DROP POLICY IF EXISTS "admin_all_staff" ON public.staff_profiles;
CREATE POLICY "admin_all_staff" ON public.staff_profiles
    FOR ALL
    USING (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "self_read_staff" ON public.staff_profiles;
CREATE POLICY "self_read_staff" ON public.staff_profiles
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- ---- products & categories ----
DROP POLICY IF EXISTS "authenticated_read_products" ON public.products;
CREATE POLICY "authenticated_read_products" ON public.products
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "admin_manage_products" ON public.products;
CREATE POLICY "admin_manage_products" ON public.products
    FOR ALL
    USING (public.get_current_user_role() = 'admin');

DROP POLICY IF EXISTS "authenticated_read_categories" ON public.product_categories;
CREATE POLICY "authenticated_read_categories" ON public.product_categories
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "authenticated_read_recipes" ON public.product_recipes;
CREATE POLICY "authenticated_read_recipes" ON public.product_recipes
    FOR SELECT
    USING ((SELECT auth.role()) = 'authenticated');

-- ---- inventory ----
DROP POLICY IF EXISTS "inventory_read" ON public.inventory;
CREATE POLICY "inventory_read" ON public.inventory
    FOR SELECT
    USING (public.get_current_user_role() IN ('admin', 'inventory_personnel'));

DROP POLICY IF EXISTS "inventory_write" ON public.inventory;
CREATE POLICY "inventory_write" ON public.inventory
    FOR ALL
    USING (public.get_current_user_role() IN ('admin', 'inventory_personnel'));

-- ---- inventory movements ----
DROP POLICY IF EXISTS "inv_mov_read" ON public.inventory_movements;
CREATE POLICY "inv_mov_read" ON public.inventory_movements
    FOR SELECT
    USING (public.get_current_user_role() IN ('admin', 'inventory_personnel'));

DROP POLICY IF EXISTS "inv_mov_insert" ON public.inventory_movements;
CREATE POLICY "inv_mov_insert" ON public.inventory_movements
    FOR INSERT
    WITH CHECK (
        public.get_current_user_role() IN ('admin', 'inventory_personnel', 'cashier')
        AND (
            performed_by IS NULL
            OR performed_by = (SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid()))
            OR public.get_current_user_role() = 'admin'
        )
    );

-- ---- orders (tightened: cashiers can only insert/view/update their own orders) ----
DROP POLICY IF EXISTS "cashier_insert_orders" ON public.orders;
CREATE POLICY "cashier_insert_orders" ON public.orders
    FOR INSERT
    WITH CHECK (
        (public.get_current_user_role() = 'cashier' AND cashier_id = (SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid())))
        OR public.get_current_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "cashier_read_own_orders" ON public.orders;
CREATE POLICY "cashier_read_own_orders" ON public.orders
    FOR SELECT
    USING (
        (public.get_current_user_role() = 'cashier' AND cashier_id = (SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid())))
        OR public.get_current_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "cashier_update_own_orders" ON public.orders;
CREATE POLICY "cashier_update_own_orders" ON public.orders
    FOR UPDATE
    USING (
        (public.get_current_user_role() = 'cashier' AND cashier_id = (SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid())))
        OR public.get_current_user_role() = 'admin'
    );

-- ---- order_items (tightened: cashiers can only insert/view items for their own orders) ----
DROP POLICY IF EXISTS "insert_order_items" ON public.order_items;
CREATE POLICY "insert_order_items" ON public.order_items
    FOR INSERT
    WITH CHECK (
        public.get_current_user_role() = 'admin'
        OR (
            public.get_current_user_role() = 'cashier'
            AND order_id IN (
                SELECT id FROM public.orders WHERE cashier_id = (
                    SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid())
                )
            )
        )
    );

DROP POLICY IF EXISTS "read_order_items" ON public.order_items;
CREATE POLICY "read_order_items" ON public.order_items
    FOR SELECT
    USING (
        public.get_current_user_role() = 'admin'
        OR (
            public.get_current_user_role() = 'cashier'
            AND order_id IN (
                SELECT id FROM public.orders WHERE cashier_id = (
                    SELECT id FROM public.staff_profiles WHERE user_id = (SELECT auth.uid())
                )
            )
        )
    );

-- ============================================================
-- 7. PERFORMANCE INDEXES (Idempotent)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_cashier    ON public.orders (cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_inventory ON public.inventory_movements (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_order     ON public.inventory_movements (order_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id     ON public.staff_profiles (user_id);
