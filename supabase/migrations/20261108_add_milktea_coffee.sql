-- ============================================================
-- WINGTRACK: Add Milktea & Coffee menu (Wing's Zone)
-- Aligns the menu with Chapter 1 (Background of the Study):
--   "sizzling plates, chicken wings, milktea, coffee, etc."
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================

-- 1. Categories
INSERT INTO public.product_categories (name, sort_order) VALUES
    ('Milktea', 7),
    ('Coffee', 8)
ON CONFLICT (name) DO NOTHING;

-- 2. Menu items
INSERT INTO public.products (name, category_id, price) VALUES
    ('Classic Pearl Milktea',   (SELECT id FROM public.product_categories WHERE name='Milktea'),  99.00),
    ('Wintermelon Milktea',     (SELECT id FROM public.product_categories WHERE name='Milktea'), 109.00),
    ('Okinawa Milktea',         (SELECT id FROM public.product_categories WHERE name='Milktea'), 109.00),
    ('Taro Milktea',            (SELECT id FROM public.product_categories WHERE name='Milktea'), 109.00),
    ('Hot Brewed Coffee',       (SELECT id FROM public.product_categories WHERE name='Coffee'),   69.00),
    ('Iced Americano',          (SELECT id FROM public.product_categories WHERE name='Coffee'),   89.00),
    ('Iced Caramel Macchiato',  (SELECT id FROM public.product_categories WHERE name='Coffee'),  119.00),
    ('Iced Spanish Latte',      (SELECT id FROM public.product_categories WHERE name='Coffee'),  119.00)
ON CONFLICT (name) DO NOTHING;

-- 3. Raw ingredients / packaging
INSERT INTO public.inventory (name, category, unit, stock_qty, min_stock_level, unit_cost, supplier) VALUES
    ('Black Tea Leaves',          'Beverages', 'kg',       5,     2,   450.00,  'TeaHouse Supply'),
    ('Milktea Powder Base',       'Beverages', 'kg',       8,     3,   380.00,  'TeaHouse Supply'),
    ('Flavor Syrups (Milktea)',   'Beverages', 'bottles', 12,     5,   220.00,  'TeaHouse Supply'),
    ('Tapioca Pearls',            'Beverages', 'kg',      10,     4,   150.00,  'TeaHouse Supply'),
    ('Coffee Beans (Ground)',     'Beverages', 'kg',       6,     2,   900.00,  'BrewMasters PH'),
    ('Fresh Milk',                'Dairy',     'liters',  20,     8,    95.00,  'Dairy Delights'),
    ('Condensed Milk',            'Dairy',     'cans',    24,    10,    65.00,  'Metro Grocery'),
    ('Caramel Syrup',             'Beverages', 'bottles',  6,     3,   240.00,  'Flavor House PH'),
    ('Plastic Straws',            'Packaging', 'pcs',    600,   200,     0.80,  'PackPro'),
    ('Disposable Cups',           'Packaging', 'pcs',    520,   200,     2.50,  'PackPro')
ON CONFLICT (name) DO NOTHING;

-- 4. Recipes (drives automatic stock deduction at checkout)
INSERT INTO public.product_recipes (product_id, inventory_id, qty_per_unit)
SELECT p.id, i.id, v.qty
FROM (VALUES
    ('Classic Pearl Milktea',   'Black Tea Leaves',        0.01),
    ('Classic Pearl Milktea',   'Milktea Powder Base',     0.04),
    ('Classic Pearl Milktea',   'Tapioca Pearls',          0.05),
    ('Classic Pearl Milktea',   'Disposable Cups',         1),
    ('Classic Pearl Milktea',   'Plastic Straws',          1),
    ('Wintermelon Milktea',     'Black Tea Leaves',        0.01),
    ('Wintermelon Milktea',     'Milktea Powder Base',     0.04),
    ('Wintermelon Milktea',     'Flavor Syrups (Milktea)', 0.03),
    ('Wintermelon Milktea',     'Tapioca Pearls',          0.05),
    ('Wintermelon Milktea',     'Disposable Cups',         1),
    ('Wintermelon Milktea',     'Plastic Straws',          1),
    ('Okinawa Milktea',         'Black Tea Leaves',        0.01),
    ('Okinawa Milktea',         'Milktea Powder Base',     0.04),
    ('Okinawa Milktea',         'Flavor Syrups (Milktea)', 0.03),
    ('Okinawa Milktea',         'Tapioca Pearls',          0.05),
    ('Okinawa Milktea',         'Disposable Cups',         1),
    ('Okinawa Milktea',         'Plastic Straws',          1),
    ('Taro Milktea',            'Black Tea Leaves',        0.01),
    ('Taro Milktea',            'Milktea Powder Base',     0.04),
    ('Taro Milktea',            'Flavor Syrups (Milktea)', 0.03),
    ('Taro Milktea',            'Tapioca Pearls',          0.05),
    ('Taro Milktea',            'Disposable Cups',         1),
    ('Taro Milktea',            'Plastic Straws',          1),
    ('Hot Brewed Coffee',       'Coffee Beans (Ground)',   0.018),
    ('Hot Brewed Coffee',       'Disposable Cups',         1),
    ('Iced Americano',          'Coffee Beans (Ground)',   0.018),
    ('Iced Americano',          'Disposable Cups',         1),
    ('Iced Americano',          'Plastic Straws',          1),
    ('Iced Caramel Macchiato',  'Coffee Beans (Ground)',   0.018),
    ('Iced Caramel Macchiato',  'Fresh Milk',              0.2),
    ('Iced Caramel Macchiato',  'Caramel Syrup',           0.03),
    ('Iced Caramel Macchiato',  'Disposable Cups',         1),
    ('Iced Caramel Macchiato',  'Plastic Straws',          1),
    ('Iced Spanish Latte',      'Coffee Beans (Ground)',   0.018),
    ('Iced Spanish Latte',      'Fresh Milk',              0.2),
    ('Iced Spanish Latte',      'Condensed Milk',          0.1),
    ('Iced Spanish Latte',      'Disposable Cups',         1),
    ('Iced Spanish Latte',      'Plastic Straws',          1)
) AS v(product_name, inventory_name, qty)
JOIN public.products  p ON p.name = v.product_name
JOIN public.inventory i ON i.name = v.inventory_name
ON CONFLICT (product_id, inventory_id) DO NOTHING;

