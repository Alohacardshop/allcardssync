-- Enable RLS on catalog_v2 tables and create policies
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;  
alter table catalog_v2.variants enable row level security;
alter table catalog_v2.variant_price_history enable row level security;

-- Create policies for catalog_v2.sets
create policy "Staff/Admin can view sets"
  on catalog_v2.sets for select
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.cards  
create policy "Staff/Admin can view cards"
  on catalog_v2.cards for select
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.variants
create policy "Staff/Admin can view variants"
  on catalog_v2.variants for select
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.variant_price_history
create policy "Staff/Admin can view price history"
  on catalog_v2.variant_price_history for select
  using (has_role(auth.uid(), 'staff'::app_role) or has_role(auth.uid(), 'admin'::app_role));

-- Insert some sample data for testing the edge function
insert into catalog_v2.sets (set_id, game, name) values
  ('sv1', 'pokemon', 'Scarlet & Violet'),
  ('sv2', 'pokemon', 'Paldea Evolved'),
  ('dmu', 'mtg', 'Dominaria United')
on conflict (provider, set_id) do nothing;

insert into catalog_v2.cards (card_id, game, set_id, name) values
  ('sv1-001', 'pokemon', 'sv1', 'Sprigatito'),
  ('sv1-002', 'pokemon', 'sv1', 'Floragato'),  
  ('sv2-001', 'pokemon', 'sv2', 'Charmander'),
  ('dmu-001', 'mtg', 'dmu', 'Lightning Bolt')
on conflict (provider, card_id) do nothing;