-- Import Jobs Log Table Migration
BEGIN;

-- Extensions for IDs and text search if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Jobs log table
CREATE TABLE IF NOT EXISTS catalog_v2.import_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,                          -- e.g. 'justtcg' | 'pokemon-api'
  game          text NOT NULL CHECK (game IN ('mtg','pokemon','pokemon-japan')),
  set_id        text,                                   -- nullable for all-game orchestrations
  set_code      text,                                   -- optional display code
  total         integer,                                -- total cards discovered (optional)
  inserted      integer,                                -- cards actually upserted this run (optional)
  status        text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS import_jobs_game_status_created_idx
  ON catalog_v2.import_jobs (game, status, created_at DESC);

CREATE INDEX IF NOT EXISTS import_jobs_set_idx
  ON catalog_v2.import_jobs (set_id);

-- RLS: allow authenticated to read, restrict writes to service role
ALTER TABLE catalog_v2.import_jobs ENABLE ROW LEVEL SECURITY;

-- Read policy
CREATE POLICY import_jobs_select_authenticated ON catalog_v2.import_jobs
  FOR SELECT USING (true);  -- read-only log; safe to expose

-- (No INSERT/UPDATE policy; Edge Functions use service role bypassing RLS)

COMMIT;