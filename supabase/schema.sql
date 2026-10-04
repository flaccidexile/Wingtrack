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
    ('Sizzling', 2),
    ('Silog', 3),
    ('Shake', 4),
    ('Burger', 5),
    ('Fries & Pure Cheesestick', 6)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.products (name, category_id, price) VALUES
    -- Wings
    ('Classic Buffalo Wings',                 (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Honey Garlic Wings',                    (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Spicy Sriracha Wings',                  (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('BBQ Smokey Wings',                      (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Lemon Pepper Wings',                    (SELECT id FROM public.product_categories WHERE name='Wings'), 199.00),
    ('Party Bucket (20pcs)',                  (SELECT id FROM public.product_categories WHERE name='Wings'), 599.00),

    -- Sizzling
    ('Sizzling Pork Sisig',                   (SELECT id FROM public.product_categories WHERE name='Sizzling'), 189.00),
    ('Sizzling Chicken Steak',                (SELECT id FROM public.product_categories WHERE name='Sizzling'), 179.00),
    ('Sizzling Beef Tapa',                    (SELECT id FROM public.product_categories WHERE name='Sizzling'), 199.00),
    ('Sizzling Pork Chop',                    (SELECT id FROM public.product_categories WHERE name='Sizzling'), 169.00),

    -- Silog
    ('Tapsilog Special',                      (SELECT id FROM public.product_categories WHERE name='Silog'), 149.00),
    ('Tocilog Delight',                       (SELECT id FROM public.product_categories WHERE name='Silog'), 139.00),
    ('Chicksilog Wing Meal',                  (SELECT id FROM public.product_categories WHERE name='Silog'), 149.00),
    ('Bangsilog Supreme',                     (SELECT id FROM public.product_categories WHERE name='Silog'), 159.00),
    ('Longsilog Classic',                     (SELECT id FROM public.product_categories WHERE name='Silog'), 129.00),

    -- Shake
    ('Fresh Mango Shake',                     (SELECT id FROM public.product_categories WHERE name='Shake'), 89.00),
    ('Strawberry Milkshake',                  (SELECT id FROM public.product_categories WHERE name='Shake'), 89.00),
    ('Rich Chocolate Shake',                  (SELECT id FROM public.product_categories WHERE name='Shake'), 89.00),
    ('House Blend Iced Tea',                  (SELECT id FROM public.product_categories WHERE name='Shake'), 45.00),
    ('Bottomless Soda',                       (SELECT id FROM public.product_categories WHERE name='Shake'), 65.00),

    -- Burger
    ('Classic Beef Burger',                   (SELECT id FROM public.product_categories WHERE name='Burger'), 119.00),
    ('Cheesy Bacon Burger',                   (SELECT id FROM public.product_categories WHERE name='Burger'), 159.00),
    ('Crispy Chicken Burger',                 (SELECT id FROM public.product_categories WHERE name='Burger'), 149.00),
    ('Double Smash Burger',                   (SELECT id FROM public.product_categories WHERE name='Burger'), 189.00),

    -- Fries & Pure Cheesestick
    ('Pure Mozzarella Cheesesticks (6pcs)',   (SELECT id FROM public.product_categories WHERE name='Fries & Pure Cheesestick'), 129.00),
    ('Crispy Golden Fries',                   (SELECT id FROM public.product_categories WHERE name='Fries & Pure Cheesestick'), 79.00),
    ('Loaded Cheese Fries',                   (SELECT id FROM public.product_categories WHERE name='Fries & Pure Cheesestick'), 99.00),
    ('Cheesestick & Fries Combo',             (SELECT id FROM public.product_categories WHERE name='Fries & Pure Cheesestick'), 169.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.inventory (name, category, unit, stock_qty, min_stock_level, unit_cost, supplier) VALUES
    ('Chicken Wings (Raw)',       'Proteins',  'kg',      24.5,  10,   280.00,  'FreshFarm Supply'),
    ('Pork Sisig Meat',           'Proteins',  'kg',      15.0,   8,   260.00,  'FreshFarm Supply'),
    ('Beef Tapa Cut',             'Proteins',  'kg',      12.0,   6,   340.00,  'MeatMaster PH'),
    ('Burger Beef Patties',       'Proteins',  'pcs',     60.0,  20,    42.00,  'MeatMaster PH'),
    ('Mozzarella Cheesesticks',   'Dairy',     'packs',   25.0,  10,   110.00,  'Dairy Delights'),
    ('Burger Buns',               'Bakery',    'packs',   40.0,  15,    35.00,  'GoldBake Bakery'),
    ('Honey Garlic Sauce',        'Sauces',    'bottles',  8,    12,   185.00,  'Flavor House PH'),
    ('Buffalo Hot Sauce',         'Sauces',    'bottles', 15,    10,   210.00,  'Flavor House PH'),
    ('Sriracha Sauce',            'Sauces',    'bottles',  5,     8,   195.00,  'Flavor House PH'),
    ('BBQ Sauce',                 'Sauces',    'bottles', 11,    10,   175.00,  'Flavor House PH'),
    ('Cheese Sauce Mix',          'Sauces',    'packs',   14,     8,   130.00,  'Flavor House PH'),
    ('Cooking Oil (Palm)',        'Cooking',   'liters',  42,    20,    90.00,  'Metro Grocery'),
    ('Frozen Fries',              'Sides',     'kg',      28,    15,   120.00,  'FreshFarm Supply'),
    ('White Rice (Sacks)',        'Staples',   'sacks',    4,     3,  2200.00,  'Metro Grocery'),
    ('Fresh Eggs (Trays)',        'Produce',   'trays',   12,     5,   230.00,  'FreshFarm Supply'),
    ('Mango Fruit Puree',         'Beverages', 'kg',       9,     5,   160.00,  'FruitSource PH'),
    ('Chocolate / Shake Syrup',   'Beverages', 'bottles',  8,     4,   140.00,  'Flavor House PH'),
    ('Disposable Cups',           'Packaging', 'pcs',    520,   200,     2.50,  'PackPro'),
    ('Take-out Boxes',            'Packaging', 'pcs',    180,   100,     8.00,  'PackPro'),
    ('Napkins (Packs)',           'Packaging', 'packs',   28,    20,    35.00,  'PackPro')
ON CONFLICT (name) DO NOTHING;

-- Seed recipes safely
INSERT INTO public.product_recipes (product_id, inventory_id, qty_per_unit)
SELECT
    p.id,
    i.id,
    v.qty
FROM (VALUES
    ('Classic Buffalo Wings',                 'Chicken Wings (Raw)',     0.4),
    ('Classic Buffalo Wings',                 'Buffalo Hot Sauce',       0.1),
    ('Classic Buffalo Wings',                 'Cooking Oil (Palm)',      0.05),
    ('Classic Buffalo Wings',                 'Take-out Boxes',          1),

    ('Honey Garlic Wings',                    'Chicken Wings (Raw)',     0.4),
    ('Honey Garlic Wings',                    'Honey Garlic Sauce',      0.1),
    ('Honey Garlic Wings',                    'Cooking Oil (Palm)',      0.05),
    ('Honey Garlic Wings',                    'Take-out Boxes',          1),

    ('Spicy Sriracha Wings',                  'Chicken Wings (Raw)',     0.4),
    ('Spicy Sriracha Wings',                  'Sriracha Sauce',          0.1),
    ('Spicy Sriracha Wings',                  'Cooking Oil (Palm)',      0.05),
    ('Spicy Sriracha Wings',                  'Take-out Boxes',          1),

    ('Party Bucket (20pcs)',                  'Chicken Wings (Raw)',     2.0),
    ('Party Bucket (20pcs)',                  'Cooking Oil (Palm)',      0.3),
    ('Party Bucket (20pcs)',                  'Take-out Boxes',          2),

    ('Sizzling Pork Sisig',                   'Pork Sisig Meat',         0.25),
    ('Sizzling Pork Sisig',                   'Cooking Oil (Palm)',      0.03),
    ('Sizzling Pork Sisig',                   'Take-out Boxes',          1),

    ('Tapsilog Special',                      'Beef Tapa Cut',           0.15),
    ('Tapsilog Special',                      'White Rice (Sacks)',      0.02),
    ('Tapsilog Special',                      'Fresh Eggs (Trays)',      0.033),
    ('Tapsilog Special',                      'Take-out Boxes',          1),

    ('Classic Beef Burger',                   'Burger Beef Patties',     1),
    ('Classic Beef Burger',                   'Burger Buns',             1),
    ('Classic Beef Burger',                   'Take-out Boxes',          1),

    ('Pure Mozzarella Cheesesticks (6pcs)',   'Mozzarella Cheesesticks', 0.25),
    ('Pure Mozzarella Cheesesticks (6pcs)',   'Cooking Oil (Palm)',      0.05),
    ('Pure Mozzarella Cheesesticks (6pcs)',   'Take-out Boxes',          1),

    ('Loaded Cheese Fries',                   'Frozen Fries',            0.25),
    ('Loaded Cheese Fries',                   'Cheese Sauce Mix',        0.05),
    ('Loaded Cheese Fries',                   'Cooking Oil (Palm)',      0.05),
    ('Loaded Cheese Fries',                   'Take-out Boxes',          1),

    ('Fresh Mango Shake',                     'Mango Fruit Puree',       0.15),
    ('Fresh Mango Shake',                     'Disposable Cups',         1),

    ('House Blend Iced Tea',                  'Disposable Cups',         1)
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
