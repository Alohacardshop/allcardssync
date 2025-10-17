-- Add user-specific printer preferences
create table if not exists public.user_printer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  printer_type text not null check (printer_type in ('zebra', 'printnode')),
  printer_id text,
  printer_name text,
  printer_ip text,
  printer_port integer,
  store_key text,
  location_gid text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(user_id, store_key, location_gid)
);

comment on table public.user_printer_preferences is 'Stores per-user default printer preferences for each store/location';
comment on column public.user_printer_preferences.printer_type is 'Type of printer: zebra (direct IP) or printnode';
comment on column public.user_printer_preferences.store_key is 'Shopify store key this preference applies to';
comment on column public.user_printer_preferences.location_gid is 'Shopify location GID this preference applies to';

-- Enable RLS
alter table public.user_printer_preferences enable row level security;

-- Users can manage their own printer preferences
create policy "Users can manage their own printer preferences"
on public.user_printer_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Create index for faster lookups
create index user_printer_preferences_user_store_location_idx 
on public.user_printer_preferences(user_id, store_key, location_gid);