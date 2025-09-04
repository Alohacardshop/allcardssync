-- Add RLS policies for catalog_v2 tables
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;
alter table catalog_v2.variants enable row level security;

-- Allow staff/admin to read catalog data
create policy "Staff can view sets" on catalog_v2.sets for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
create policy "Staff can view cards" on catalog_v2.cards for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));  
create policy "Staff can view variants" on catalog_v2.variants for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add some sample data for testing using generated UUIDs
insert into catalog_v2.sets (set_id, game, name) values
  ('pokemon-sv1', 'pokemon', 'Scarlet & Violet'),
  ('pokemon-sv2', 'pokemon', 'Paldea Evolved'),
  ('mtg-dominaria-united', 'mtg', 'Dominaria United')
on conflict do nothing;

insert into catalog_v2.cards (card_id, game, set_id, name) values
  ('pokemon-sv1-sprigatito', 'pokemon', 'pokemon-sv1', 'Sprigatito'),
  ('pokemon-sv1-floragato', 'pokemon', 'pokemon-sv1', 'Floragato'),
  ('pokemon-sv2-charmander', 'pokemon', 'pokemon-sv2', 'Charmander'),
  ('mtg-dmu-lightning-bolt', 'mtg', 'mtg-dominaria-united', 'Lightning Bolt')
on conflict do nothing;

insert into catalog_v2.variants (variant_key, card_id, game, language, printing, condition, price, market_price) values
  ('pokemon-sv1-sprigatito-en-nm', 'pokemon-sv1-sprigatito', 'pokemon', 'English', '1st Edition', 'Near Mint', 5.99, 6.50),
  ('pokemon-sv1-floragato-en-nm', 'pokemon-sv1-floragato', 'pokemon', 'English', '1st Edition', 'Near Mint', 12.99, 14.00),
  ('pokemon-sv2-charmander-en-nm', 'pokemon-sv2-charmander', 'pokemon', 'English', '1st Edition', 'Near Mint', 3.99, 4.25),
  ('mtg-dmu-lightning-bolt-en-nm', 'mtg-dmu-lightning-bolt', 'mtg', 'English', 'Regular', 'Near Mint', 0.25, 0.30)
on conflict do nothing;