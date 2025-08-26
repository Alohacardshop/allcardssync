-- ✅ async HTTP wrapper the Edge Function can call
create or replace function public.http_post_async(url text, headers jsonb, body jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare rid uuid;
begin
  select (net.http_post(url := url, headers := headers, body := body)).request_id into rid;
  return rid;
end$$;
revoke all on function public.http_post_async(text,jsonb,jsonb) from public;
grant execute on function public.http_post_async(text,jsonb,jsonb) to authenticated;

-- ✅ live stats (sets/cards/pending) for a game
create or replace function public.catalog_v2_stats(game_in text)
returns table(sets_count bigint, cards_count bigint, pending_sets bigint)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from catalog_v2.sets  s where s.game = game_in) as sets_count,
    (select count(*) from catalog_v2.cards c where c.game = game_in) as cards_count,
    (select count(*) from (
       select s.id
       from catalog_v2.sets s
       left join catalog_v2.cards c on c.set_id = s.id and c.game = game_in
       where s.game = game_in
       group by s.id
       having count(c.id) = 0
    ) x) as pending_sets
$$;
revoke all on function public.catalog_v2_stats(text) from public;
grant execute on function public.catalog_v2_stats(text) to authenticated;

-- ✅ queue all pending sets for a game via pg_net
create or replace function public.catalog_v2_queue_pending_sets(game_in text, functions_base text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare rec record; queued int := 0;
begin
  for rec in
    select s.id
    from catalog_v2.sets s
    left join catalog_v2.cards c on c.set_id = s.id and c.game = game_in
    where s.game = game_in
    group by s.id
    having count(c.id) = 0
  loop
    perform net.http_post(
      url := functions_base || '/catalog-sync-pokemon?setId=' || rec.id,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  end loop;
  return queued;
end$$;
revoke all on function public.catalog_v2_queue_pending_sets(text,text) from public;
grant execute on function public.catalog_v2_queue_pending_sets(text,text) to authenticated;