-- Add RLS policies for catalog_v2 tables
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;
alter table catalog_v2.variants enable row level security;

-- Allow staff/admin to read catalog data
create policy "Staff can view sets" on catalog_v2.sets for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
create policy "Staff can view cards" on catalog_v2.cards for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));  
create policy "Staff can view variants" on catalog_v2.variants for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add some sample data for testing
insert into catalog_v2.sets (set_id, game, name) values
  ('sv1', 'pokemon', 'Scarlet & Violet'),
  ('sv2', 'pokemon', 'Paldea Evolved'),
  ('mtg-dmu', 'mtg', 'Dominaria United')
on conflict do nothing;

insert into catalog_v2.cards (card_id, game, set_id, name) values
  ('sv1-001', 'pokemon', 'sv1', 'Sprigatito'),
  ('sv1-002', 'pokemon', 'sv1', 'Floragato'),
  ('sv2-001', 'pokemon', 'sv2', 'Charmander'),
  ('dmu-001', 'mtg', 'mtg-dmu', 'Lightning Bolt')
on conflict do nothing;

insert into catalog_v2.variants (variant_key, card_id, game, language, printing, condition, price, market_price) values
  ('sv1-001-en-1st-nm', 'sv1-001', 'pokemon', 'English', '1st Edition', 'Near Mint', 5.99, 6.50),
  ('sv1-002-en-1st-nm', 'sv1-002', 'pokemon', 'English', '1st Edition', 'Near Mint', 12.99, 14.00),
  ('sv2-001-en-1st-nm', 'sv2-001', 'pokemon', 'English', '1st Edition', 'Near Mint', 3.99, 4.25),
  ('dmu-001-en-reg-nm', 'dmu-001', 'mtg', 'English', 'Regular', 'Near Mint', 0.25, 0.30)
on conflict do nothing;