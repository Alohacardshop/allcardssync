
-- 1) Trigger function to default price when missing
create or replace function public.set_intake_price_default()
returns trigger
language plpgsql
as $$
begin
  if new.price is null then
    new.price := 99999.00;
  end if;
  return new;
end;
$$;

-- 2) Apply trigger on insert and update
drop trigger if exists trg_intake_items_price_default on public.intake_items;
create trigger trg_intake_items_price_default
before insert or update on public.intake_items
for each row
execute function public.set_intake_price_default();

-- 3) Backfill any existing rows with NULL price
update public.intake_items
set price = 99999.00
where price is null;
