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
