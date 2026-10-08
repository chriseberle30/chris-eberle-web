-- E30 Gestión security cutover — DRAFT ONLY
-- Do not run until the frontend has been converted to Supabase Auth and tested.
-- Current frontend uses a browser-only SHA-256 password gate and the anon key;
-- enabling these policies before frontend conversion will break the app.
--
-- Assumptions for this first pass:
--   * E30 is a single-owner application.
--   * Supabase Auth signups are disabled after the owner's user is created.
--   * The authenticated role is granted access to E30 data.
--   * The print receiver also signs in with the same owner account.
--
-- Preflight:
--   1. Export e30_kv and verify restore.
--   2. Create/confirm the owner's Supabase Auth user.
--   3. Update the app so every REST call sends the current Auth access token.
--   4. Test login, read/write, print queue, and logout on a staging copy.
--   5. Only then execute the statements below in production.

BEGIN;

-- Remove public policies that allow anonymous access.
DROP POLICY IF EXISTS "public read" ON public.e30_kv;
DROP POLICY IF EXISTS "public insert" ON public.e30_kv;
DROP POLICY IF EXISTS "public update" ON public.e30_kv;

-- Remove table privileges from anonymous clients.
REVOKE ALL PRIVILEGES ON TABLE public.e30_kv FROM anon;

-- Authenticated app users can access the app's key/value store.
-- This is appropriate only when signup is disabled and only the owner account exists.
CREATE POLICY "e30 authenticated read"
  ON public.e30_kv FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "e30 authenticated insert"
  ON public.e30_kv FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "e30 authenticated update"
  ON public.e30_kv FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON TABLE public.e30_kv TO authenticated;

COMMIT;

-- Postflight checks:
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies WHERE schemaname='public' AND tablename='e30_kv';
-- Test anonymous REST reads/writes are denied, authenticated owner's access works,
-- and print jobs can still be created, claimed, printed, and marked complete.
