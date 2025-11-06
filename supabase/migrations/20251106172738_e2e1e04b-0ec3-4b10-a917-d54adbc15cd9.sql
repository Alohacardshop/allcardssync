-- Card Show Tool Database Schema

-- 1. Locations table
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.locations enable row level security;

create policy "Staff can view locations"
  on public.locations for select
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage locations"
  on public.locations for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- 2. Shows table
create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  start_date date,
  end_date date,
  location_id uuid references public.locations(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.shows enable row level security;

create policy "Staff can view shows"
  on public.shows for select
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage shows"
  on public.shows for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- 3. User Profiles table (stores default show/location preferences only, NOT roles)
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_show_id uuid references public.shows(id) on delete set null,
  default_location_id uuid references public.locations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can view own profile"
  on public.user_profiles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.user_profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can insert own profile"
  on public.user_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 4. ALT Items table
create table if not exists public.alt_items (
  id uuid primary key default gen_random_uuid(),
  alt_uuid text,
  alt_url text unique,
  title text,
  grade text,
  grading_service text,
  set_name text,
  year text,
  population text,
  image_url text,
  alt_value numeric,
  alt_checked_at timestamptz,
  alt_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.alt_items enable row level security;

create policy "Staff can view alt_items"
  on public.alt_items for select
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can manage alt_items"
  on public.alt_items for all
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- 5. Card Transactions table
create table if not exists public.card_transactions (
  id uuid primary key default gen_random_uuid(),
  alt_item_id uuid references public.alt_items(id) on delete cascade,
  show_id uuid references public.shows(id) on delete set null,
  txn_type varchar(10) not null check (txn_type in ('BUY', 'SELL')),
  price numeric,
  txn_date timestamptz default now(),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.card_transactions enable row level security;

create policy "Staff can view transactions"
  on public.card_transactions for select
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

create policy "Staff can manage transactions"
  on public.card_transactions for all
  to authenticated
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- 6. Scrape Sessions table
create table if not exists public.scrape_sessions (
  id uuid primary key default gen_random_uuid(),
  service varchar(16) not null,
  status text check (status in ('ready', 'needs-human', 'expired', 'error')),
  last_login_at timestamptz,
  last_cookie_refresh_at timestamptz,
  message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(service)
);

alter table public.scrape_sessions enable row level security;

create policy "Admins can view scrape_sessions"
  on public.scrape_sessions for select
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage scrape_sessions"
  on public.scrape_sessions for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at triggers for all tables
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_locations_updated_at before update on public.locations
  for each row execute function public.update_updated_at_column();

create trigger update_shows_updated_at before update on public.shows
  for each row execute function public.update_updated_at_column();

create trigger update_user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.update_updated_at_column();

create trigger update_alt_items_updated_at before update on public.alt_items
  for each row execute function public.update_updated_at_column();

create trigger update_card_transactions_updated_at before update on public.card_transactions
  for each row execute function public.update_updated_at_column();

create trigger update_scrape_sessions_updated_at before update on public.scrape_sessions
  for each row execute function public.update_updated_at_column();