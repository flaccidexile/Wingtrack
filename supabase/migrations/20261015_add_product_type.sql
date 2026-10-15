-- ============================================================
-- WINGTRACK: Add product_type to products table
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================

ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'Regular';

-- Add a comment explaining valid types
COMMENT ON COLUMN public.products.product_type IS 'Product badge type: Regular, Bestseller, New, Seasonal, Special';
