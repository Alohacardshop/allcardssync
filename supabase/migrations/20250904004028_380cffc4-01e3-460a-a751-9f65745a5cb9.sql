
-- 1) Ensure schema exists for catalog_v2
create schema if not exists catalog_v2;

-- 2) Append-only variant pricing history
create table if not exists catalog_v2.variant_price_history (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'justtcg',
  game text not null,
  variant_key text not null,            -- from variants.variant_key or provider's variant_id as fallback
  price_cents int,
  market_price_cents int,
  low_price_cents int,
  high_price_cents int,
  currency text default 'USD',
  scraped_at timestamptz not null default now()
);

create index if not exists vph_game_variant_key_idx
  on catalog_v2.variant_price_history(game, variant_key);

-- 3) Tiny run summaries table (for Admin UI over last 24h)
create table if not exists public.pricing_job_runs (
  id uuid primary key default gen_random_uuid(),
  game text not null,
  expected_batches int not null default 0,
  actual_batches int not null default 0,
  cards_processed int not null default 0,
  variants_updated int not null default 0,
  duration_ms int not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: Admin/Staff can view; inserts come from Edge Function using service role
alter table public.pricing_job_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pricing_job_runs' and policyname = 'Admins can view runs'
  ) then
    create policy "Admins can view runs"
      on public.pricing_job_runs
      for select
      using (has_role(auth.uid(), 'admin'::app_role));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pricing_job_runs' and policyname = 'Staff can view runs'
  ) then
    create policy "Staff can view runs"
      on public.pricing_job_runs
      for select
      using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
  end if;
end $$;

-- 4) Enable required extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 5) Nightly cron schedules (UTC)
-- Project ref: dmpoandoydaqxhzdjnmk
-- Endpoints:
--   https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon
--   https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon-japan
--   https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=mtg

-- Nightly Pokémon EN (00:00 UTC)
select cron.schedule(
  'justtcg-refresh-pokemon-nightly',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Nightly Pokémon JP (00:02 UTC)
select cron.schedule(
  'justtcg-refresh-pokemon-japan-nightly',
  '2 0 * * *',
  $$
  select net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon-japan',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Nightly MTG (00:04 UTC) -- canonical 'mtg'
select cron.schedule(
  'justtcg-refresh-mtg-nightly',
  '4 0 * * *',
  $$
  select net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=mtg',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 6) Initial one-time calls NOW (safe to keep)
select net.http_post(
  url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb
);
select net.http_post(
  url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=pokemon-japan',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb
);
select net.http_post(
  url := 'https://dmpoandoydaqxhzdjnmk.functions.supabase.co/justtcg-refresh-variants?game=mtg',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body := '{}'::jsonb
);
