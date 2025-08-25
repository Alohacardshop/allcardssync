
-- 1) Stores table
create table if not exists public.shopify_stores (
  key text primary key,
  name text not null,
  domain text,
  vendor text,
  api_version text default '2024-07',
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- Ensure updated_at stays current
drop trigger if exists trg_shopify_stores_updated_at on public.shopify_stores;
create trigger trg_shopify_stores_updated_at
before update on public.shopify_stores
for each row
execute function public.update_updated_at_column();

alter table public.shopify_stores enable row level security;

-- RLS: Staff/Admin can view; only Admin can write
drop policy if exists "Staff/Admin can view shopify_stores" on public.shopify_stores;
create policy "Staff/Admin can view shopify_stores"
  on public.shopify_stores
  for select
  using (public.has_role(auth.uid(), 'staff') or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can insert shopify_stores" on public.shopify_stores;
create policy "Admins can insert shopify_stores"
  on public.shopify_stores
  for insert
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can update shopify_stores" on public.shopify_stores;
create policy "Admins can update shopify_stores"
  on public.shopify_stores
  for update
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can delete shopify_stores" on public.shopify_stores;
create policy "Admins can delete shopify_stores"
  on public.shopify_stores
  for delete
  using (public.has_role(auth.uid(), 'admin'));

-- Seed the two stores (safe if re-run)
insert into public.shopify_stores (key, name, vendor)
values 
  ('hawaii', 'Hawaii Store', 'Aloha Card Shop'),
  ('las_vegas', 'Las Vegas Store', 'Aloha Card Shop')
on conflict (key) do nothing;

-- 2) User assignments table
create table if not exists public.user_shopify_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_key text not null references public.shopify_stores(key) on delete cascade,
  location_gid text not null, -- e.g., gid://shopify/Location/123
  location_name text,         -- convenient display name snapshot
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_key, location_gid)
);

-- Only one default per user per store
create unique index if not exists uniq_user_store_default
  on public.user_shopify_assignments (user_id, store_key)
  where is_default = true;

-- Keep updated_at current
drop trigger if exists trg_user_shopify_assignments_updated_at on public.user_shopify_assignments;
create trigger trg_user_shopify_assignments_updated_at
before update on public.user_shopify_assignments
for each row
execute function public.update_updated_at_column();

alter table public.user_shopify_assignments enable row level security;

-- RLS: Users can view their own; Admins can view/modify all
drop policy if exists "Users can view their own assignments" on public.user_shopify_assignments;
create policy "Users can view their own assignments"
  on public.user_shopify_assignments
  for select
  using (auth.uid() = user_id);

drop policy if exists "Admins can view all assignments" on public.user_shopify_assignments;
create policy "Admins can view all assignments"
  on public.user_shopify_assignments
  for select
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can insert assignments" on public.user_shopify_assignments;
create policy "Admins can insert assignments"
  on public.user_shopify_assignments
  for insert
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can update assignments" on public.user_shopify_assignments;
create policy "Admins can update assignments"
  on public.user_shopify_assignments
  for update
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins can delete assignments" on public.user_shopify_assignments;
create policy "Admins can delete assignments"
  on public.user_shopify_assignments
  for delete
  using (public.has_role(auth.uid(), 'admin'));
