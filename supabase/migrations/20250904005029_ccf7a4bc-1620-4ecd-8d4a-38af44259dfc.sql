-- Insert sample data for testing (if not exists)
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