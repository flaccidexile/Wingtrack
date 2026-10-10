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
