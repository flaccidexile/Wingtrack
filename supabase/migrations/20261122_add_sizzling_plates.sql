-- ============================================================
-- WINGTRACK: Add Sizzling Plates menu (Wing's Zone)
-- Aligns the menu with Chapter 1 (Background of the Study):
--   "sizzling plates, chicken wings, milktea, coffee, etc."
-- Run in Supabase SQL Editor (Idempotent & Rerunnable Migration)
-- ============================================================

-- 1. Category
INSERT INTO public.product_categories (name, sort_order) VALUES
    ('Sizzling Plates', 5)
ON CONFLICT (name) DO NOTHING;

-- 2. Menu items
INSERT INTO public.products (name, category_id, price) VALUES
    ('Sizzling Pork Sisig',    (SELECT id FROM public.product_categories WHERE name='Sizzling Plates'), 189.00),
    ('Sizzling Chicken Steak', (SELECT id FROM public.product_categories WHERE name='Sizzling Plates'), 179.00),
    ('Sizzling Beef Tapa',     (SELECT id FROM public.product_categories WHERE name='Sizzling Plates'), 199.00),
    ('Sizzling Pork Chop',     (SELECT id FROM public.product_categories WHERE name='Sizzling Plates'), 169.00)
ON CONFLICT (name) DO NOTHING;

-- 3. Raw ingredients
INSERT INTO public.inventory (name, category, unit, stock_qty, min_stock_level, unit_cost, supplier) VALUES
    ('Pork Sisig Cut',        'Proteins', 'kg',  12,  4, 310.00, 'Metro Meat Supply'),
    ('Chicken Breast Fillet', 'Proteins', 'kg',  10,  4, 260.00, 'Metro Poultry Supply'),
    ('Beef Tapa Strips',      'Proteins', 'kg',   8,  3, 420.00, 'Metro Meat Supply'),
    ('Pork Chop Cut',         'Proteins', 'kg',  10,  4, 300.00, 'Metro Meat Supply'),
    ('Sizzling Gravy Mix',    'Sauces',   'kg',   5,  2, 280.00, 'Flavor House PH'),
    ('Fresh Eggs',            'Dairy',    'pcs', 90, 30,   9.00, 'FarmFresh PH')
ON CONFLICT (name) DO NOTHING;

-- 4. Recipes (drives automatic stock deduction & COGS calculation at checkout)
INSERT INTO public.product_recipes (product_id, inventory_id, qty_per_unit)
SELECT p.id, i.id, v.qty
FROM (VALUES
    ('Sizzling Pork Sisig',    'Pork Sisig Cut',        0.22),
    ('Sizzling Pork Sisig',    'Fresh Eggs',            1),
    ('Sizzling Pork Sisig',    'Cooking Oil (Palm)',    0.03),
    ('Sizzling Pork Sisig',    'White Rice (Sacks)',    0.01),
    ('Sizzling Chicken Steak', 'Chicken Breast Fillet', 0.22),
    ('Sizzling Chicken Steak', 'Sizzling Gravy Mix',    0.04),
    ('Sizzling Chicken Steak', 'Cooking Oil (Palm)',    0.03),
    ('Sizzling Chicken Steak', 'White Rice (Sacks)',    0.01),
    ('Sizzling Beef Tapa',     'Beef Tapa Strips',      0.20),
    ('Sizzling Beef Tapa',     'Fresh Eggs',            1),
    ('Sizzling Beef Tapa',     'Cooking Oil (Palm)',    0.03),
    ('Sizzling Beef Tapa',     'White Rice (Sacks)',    0.01),
    ('Sizzling Pork Chop',     'Pork Chop Cut',         0.24),
    ('Sizzling Pork Chop',     'Sizzling Gravy Mix',    0.04),
    ('Sizzling Pork Chop',     'Cooking Oil (Palm)',    0.03),
    ('Sizzling Pork Chop',     'White Rice (Sacks)',    0.01)
) AS v(product_name, inventory_name, qty)
JOIN public.products  p ON p.name = v.product_name
JOIN public.inventory i ON i.name = v.inventory_name
ON CONFLICT (product_id, inventory_id) DO NOTHING;
