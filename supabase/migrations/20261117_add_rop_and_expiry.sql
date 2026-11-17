-- ============================================================
-- WINGTRACK: Add Reorder Point (lead_time_days) & Perishable
-- Batch Expiration Date (expiration_date) to inventory
-- Run in Supabase SQL Editor (Idempotent & Rerunnable)
-- ============================================================

ALTER TABLE public.inventory
    ADD COLUMN IF NOT EXISTS expiration_date DATE,
    ADD COLUMN IF NOT EXISTS lead_time_days  INT NOT NULL DEFAULT 2 CHECK (lead_time_days >= 1);

COMMENT ON COLUMN public.inventory.expiration_date IS 'Optional batch expiration / best-before date for perishable items';
COMMENT ON COLUMN public.inventory.lead_time_days  IS 'Supplier delivery lead time in days used for Reorder Point (ROP) calculation';
