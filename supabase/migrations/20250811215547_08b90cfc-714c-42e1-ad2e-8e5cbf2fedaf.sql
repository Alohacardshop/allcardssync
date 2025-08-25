
-- 1) Sequence for Lot Numbers
create sequence if not exists public.lot_number_seq;

-- 2) Function to generate next lot number like LOT-000001
create or replace function public.generate_lot_number()
returns text
language plpgsql
as $$
declare
  v_next bigint;
begin
  v_next := nextval('public.lot_number_seq');
  return 'LOT-' || to_char(v_next, 'FM000000');
end;
$$;

-- 3) Table to store intake items with auto-assigned lot_number
create table if not exists public.intake_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Auto lot number assigned via function; unique to avoid duplicates
  lot_number text not null default public.generate_lot_number(),
  unique (lot_number),

  -- Quick Intake fields
  year text,
  brand_title text,
  subject text,
  category text,
  variant text,
  card_number text,
  grade text,
  psa_cert text,
  price numeric(12,2),
  sku text
);

-- 4) Keep updated_at in sync using the existing trigger function
drop trigger if exists trg_intake_items_set_timestamp on public.intake_items;
create trigger trg_intake_items_set_timestamp
before update on public.intake_items
for each row
execute procedure public.update_updated_at_column();

-- 5) Enable RLS and add open policies (like your other tables)
alter table public.intake_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'intake_items' and policyname = 'Anyone can view intake_items'
  ) then
    create policy "Anyone can view intake_items"
      on public.intake_items
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'intake_items' and policyname = 'Anyone can insert intake_items'
  ) then
    create policy "Anyone can insert intake_items"
      on public.intake_items
      for insert
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'intake_items' and policyname = 'Anyone can update intake_items'
  ) then
    create policy "Anyone can update intake_items"
      on public.intake_items
      for update
      using (true);
  end if;
end $$;
