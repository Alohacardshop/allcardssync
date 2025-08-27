-- Guardrails for import_jobs to prevent duplicate in-flight jobs
BEGIN;

-- One queued/running job per (source, game, set_id). Treat NULL set_id as -1.
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_jobs_inflight
ON catalog_v2.import_jobs (source, game, COALESCE(set_id::text, '-1'))
WHERE status IN ('queued','running');

COMMIT;