-- Run as postgres, connected ONLY to yoltick_app, after owner approval and migration.
-- Stop if the role already exists: do not change an existing role silently.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'yoltick_app' THEN
    RAISE EXCEPTION 'Expected dedicated database yoltick_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations) THEN
    RAISE EXCEPTION 'Run migrations as yoltick_app first';
  END IF;
END $$;
CREATE ROLE yoltick_web LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
GRANT CONNECT ON DATABASE yoltick_app TO yoltick_web;
GRANT USAGE ON SCHEMA public TO yoltick_web;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tableowner = 'yoltick_app'
      AND tablename NOT IN ('schema_migrations', 'fake_gateway_transactions')
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO yoltick_web', item.tablename);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO yoltick_web;
-- No table ownership, schema CREATE, TRUNCATE, role membership, or default grants.
-- Existing trigger guards continue to enforce immutable audit/financial records.
COMMIT;
