-- Queue idempotence: prevent duplicate jobs
-- Note: sync_queue already has game, set_id, mode columns
-- Adding job_type for more specific deduplication

alter table if exists public.sync_queue
  add column if not exists job_type text not null default 'set_sync';

-- Unique constraint to prevent duplicate queued/processing jobs
-- Using existing columns: game, set_id, job_type
create unique index if not exists sync_queue_dedupe
on public.sync_queue (game, set_id, job_type)
where status in ('queued','processing');

comment on column public.sync_queue.job_type is 'Job type for deduplication (set_sync, variant_refresh, etc.)';
comment on index public.sync_queue_dedupe is 'Prevents duplicate jobs for same game+set+type when queued/processing';