-- stirsite_dw initial setup
-- Run once against the data warehouse database:
--   psql "$DW_DATABASE_URL" -f backend/etl/dw_init.sql

CREATE SCHEMA IF NOT EXISTS active_view;

CREATE TABLE IF NOT EXISTS public.budget_config (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_schema TEXT,
  activated_at  TIMESTAMPTZ
);

INSERT INTO public.budget_config (id, active_schema, activated_at)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.budget_registry (
  year        TEXT PRIMARY KEY,
  schema_name TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
