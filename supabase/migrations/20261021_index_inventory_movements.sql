-- ============================================================
-- WINGTRACK: Index the audit trail for paged reads
-- Run in Supabase SQL Editor
-- (Idempotent & Rerunnable Migration)
-- ============================================================
--
-- WHY THIS EXISTS
-- ---------------
-- `GET /api/inventory/movements` used to return a bare `.limit(100)` — the
-- newest page only, with no way to reach anything older. It now pages with
-- `.range(offset, offset + limit - 1)` ordered by `created_at DESC, id ASC`.
--
-- Without a composite index matching that sort, Postgres has to sort the whole
-- table before it can skip `offset` rows, so page 200 costs far more than page
-- 1 and the audit trail gets slower the more complete it becomes. This index
-- lets the planner walk the rows in order and stop early.
--
-- `id` is part of the key because it is the tie-breaker: several movements are
-- written in the same transaction (one per ingredient in an order), so
-- `created_at` collides and an index on it alone cannot give a stable page
-- boundary.
--
-- Direction note: the index is declared DESC on `created_at` to match the
-- query's `ORDER BY created_at DESC, id ASC`. Postgres can scan a DESC index
-- backwards per-column, so this single index also serves an ASC walk if one is
-- ever needed.

CREATE INDEX IF NOT EXISTS idx_inv_mov_created_id
    ON public.inventory_movements (created_at DESC, id ASC);

-- Per-ingredient history is reached by `?inventory_id=…` on the same endpoint
-- and is the path used to investigate a single stock discrepancy. The existing
-- idx_inv_mov_inventory covers the equality filter but not the combined sort,
-- so this one lets the filtered query stay index-only for ordering too.
CREATE INDEX IF NOT EXISTS idx_inv_mov_inventory_created
    ON public.inventory_movements (inventory_id, created_at DESC, id ASC);
