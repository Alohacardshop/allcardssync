-- Live stats for a game
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

-- List pending sets (optional, for UI list)
create or replace function public.catalog_v2_pending_sets(game_in text, limit_in int default 200)
returns table(set_id text, name text)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name
  from catalog_v2.sets s
  left join catalog_v2.cards c on c.set_id = s.id and c.game = game_in
  where s.game = game_in
  group by s.id, s.name
  having count(c.id) = 0
  order by s.id
  limit limit_in
$$;

revoke all on function public.catalog_v2_pending_sets(text,int) from public;
grant execute on function public.catalog_v2_pending_sets(text,int) to authenticated;

-- "Queue all pending sets" via pg_net (one HTTP POST per set)
-- Pass your Functions base, e.g. 'https://<project-ref>.functions.supabase.co'
create or replace function public.catalog_v2_queue_pending_sets(game_in text, functions_base text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  queued int := 0;
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