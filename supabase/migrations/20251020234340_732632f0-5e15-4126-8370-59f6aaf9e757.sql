-- Add Category Hierarchy System
-- Adds main_category and sub_category support with management tables

-- Step 1: Create main_categories table
CREATE TABLE IF NOT EXISTS main_categories (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  icon text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Step 2: Create sub_categories table
CREATE TABLE IF NOT EXISTS sub_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_category_id text NOT NULL REFERENCES main_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(main_category_id, name)
);

-- Step 3: Add new columns to intake_items
ALTER TABLE intake_items 
ADD COLUMN IF NOT EXISTS main_category text,
ADD COLUMN IF NOT EXISTS sub_category text;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_intake_items_main_category 
ON intake_items(main_category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_sub_category 
ON intake_items(sub_category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_main_sub_category 
ON intake_items(main_category, sub_category) WHERE deleted_at IS NULL;

-- Step 5: Enable RLS on new tables
ALTER TABLE main_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_categories ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for main_categories
CREATE POLICY "Staff can view main_categories" ON main_categories
  FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage main_categories" ON main_categories
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Step 7: Create RLS policies for sub_categories
CREATE POLICY "Staff can view sub_categories" ON sub_categories
  FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage sub_categories" ON sub_categories
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Step 8: Seed main categories
INSERT INTO main_categories (id, name, description, icon, sort_order) VALUES
  ('tcg', 'TCG', 'Trading Card Games', '🎴', 1),
  ('sports', 'Sports', 'Sports Cards & Collectibles', '⚾', 2),
  ('comics', 'Comics', 'Comic Books & Graphic Novels', '📚', 3)
ON CONFLICT (id) DO NOTHING;

-- Step 9: Seed TCG sub-categories
INSERT INTO sub_categories (main_category_id, name, sort_order) VALUES
  ('tcg', 'Magic', 1),
  ('tcg', 'YuGiOh', 2),
  ('tcg', 'Pokemon', 3),
  ('tcg', 'Axis & Allies', 4),
  ('tcg', 'Boardgames', 5),
  ('tcg', 'D & D Miniatures', 6),
  ('tcg', 'Epic', 7),
  ('tcg', 'Heroclix', 8),
  ('tcg', 'Monsterpocalypse', 9),
  ('tcg', 'Redakai', 10),
  ('tcg', 'Star Wars Miniatures', 11),
  ('tcg', 'World of Warcraft Miniatures', 12),
  ('tcg', 'WoW', 13),
  ('tcg', 'Supplies', 14),
  ('tcg', 'Organizers & Stores', 15),
  ('tcg', 'Cardfight Vanguard', 16),
  ('tcg', 'Force of Will', 17),
  ('tcg', 'Dice Masters', 18),
  ('tcg', 'Future Card BuddyFight', 19),
  ('tcg', 'Weiss Schwarz', 20),
  ('tcg', 'TCGplayer', 21),
  ('tcg', 'Dragon Ball Z TCG', 22),
  ('tcg', 'Final Fantasy TCG', 23),
  ('tcg', 'UniVersus', 24),
  ('tcg', 'Star Wars Destiny', 25),
  ('tcg', 'Dragon Ball Super CCG', 26),
  ('tcg', 'Dragoborne', 27),
  ('tcg', 'Funko', 28),
  ('tcg', 'MetaX TCG', 29),
  ('tcg', 'Card Sleeves', 30),
  ('tcg', 'Deck Boxes', 31),
  ('tcg', 'Card Storage Tins', 32),
  ('tcg', 'Life Counters', 33),
  ('tcg', 'Playmats', 34),
  ('tcg', 'Zombie World Order TCG', 35),
  ('tcg', 'The Caster Chronicles', 36),
  ('tcg', 'My Little Pony CCG', 37),
  ('tcg', 'Warhammer Books', 38),
  ('tcg', 'Warhammer Big Box Games', 39),
  ('tcg', 'Warhammer Box Sets', 40),
  ('tcg', 'Warhammer Clampacks', 41),
  ('tcg', 'Citadel Paints', 42),
  ('tcg', 'Citadel Tools', 43),
  ('tcg', 'Warhammer Game Accessories', 44),
  ('tcg', 'Books', 45),
  ('tcg', 'Exodus TCG', 46),
  ('tcg', 'Lightseekers TCG', 47),
  ('tcg', 'Protective Pages', 48),
  ('tcg', 'Storage Albums', 49),
  ('tcg', 'Collectible Storage', 50),
  ('tcg', 'Supply Bundles', 51),
  ('tcg', 'Munchkin CCG', 52),
  ('tcg', 'Warhammer Age of Sigmar Champions TCG', 53),
  ('tcg', 'Architect TCG', 54),
  ('tcg', 'Bulk Lots', 55),
  ('tcg', 'Transformers TCG', 56),
  ('tcg', 'Bakugan TCG', 57),
  ('tcg', 'KeyForge', 58),
  ('tcg', 'Chrono Clash System', 59),
  ('tcg', 'Argent Saga TCG', 60),
  ('tcg', 'Flesh & Blood TCG', 61),
  ('tcg', 'Digimon Card Game', 62),
  ('tcg', 'Alternate Souls', 63),
  ('tcg', 'Gate Ruler', 64),
  ('tcg', 'MetaZoo', 65),
  ('tcg', 'WIXOSS', 66),
  ('tcg', 'One Piece Card Game', 67),
  ('tcg', 'Marvel Comics', 68),
  ('tcg', 'DC Comics', 69),
  ('tcg', 'Lorcana TCG', 70),
  ('tcg', 'Battle Spirits Saga', 71),
  ('tcg', 'Shadowverse Evolve', 72),
  ('tcg', 'Grand Archive', 73),
  ('tcg', 'Akora', 74),
  ('tcg', 'Kryptik TCG', 75),
  ('tcg', 'Sorcery Contested Realm', 76),
  ('tcg', 'Alpha Clash', 77),
  ('tcg', 'Star Wars Unlimited', 78),
  ('tcg', 'Dragon Ball Super Fusion World', 79),
  ('tcg', 'Union Arena', 80),
  ('tcg', 'TCGplayer Supplies', 81),
  ('tcg', 'Elestrals', 82),
  ('tcg', 'Neopets Battledome', 83),
  ('tcg', 'Pokemon Japan', 84),
  ('tcg', 'Gundam Card Game', 85),
  ('tcg', 'hololive OFFICIAL CARD GAME', 86),
  ('tcg', 'Godzilla Card Game', 87),
  ('tcg', 'Riftbound League of Legends Trading Card Game', 88)
ON CONFLICT (main_category_id, name) DO NOTHING;

-- Step 10: Seed Sports sub-categories
INSERT INTO sub_categories (main_category_id, name, sort_order) VALUES
  ('sports', 'Soccer', 1),
  ('sports', 'Basketball', 2),
  ('sports', 'Baseball', 3),
  ('sports', 'Football', 4),
  ('sports', 'Tennis', 5),
  ('sports', 'Golf', 6),
  ('sports', 'Cricket', 7),
  ('sports', 'Rugby', 8),
  ('sports', 'Hockey', 9),
  ('sports', 'Boxing', 10),
  ('sports', 'Mixed Martial Arts', 11),
  ('sports', 'Wrestling', 12),
  ('sports', 'Track and Field', 13),
  ('sports', 'Cycling', 14),
  ('sports', 'Swimming', 15),
  ('sports', 'Gymnastics', 16),
  ('sports', 'Volleyball', 17),
  ('sports', 'Table Tennis', 18),
  ('sports', 'Badminton', 19),
  ('sports', 'Skateboarding', 20),
  ('sports', 'Surfing', 21),
  ('sports', 'Snowboarding', 22),
  ('sports', 'Skiing', 23),
  ('sports', 'Lacrosse', 24),
  ('sports', 'Softball', 25),
  ('sports', 'Field Hockey', 26),
  ('sports', 'Esports', 27),
  ('sports', 'Handball', 28),
  ('sports', 'Bowling', 29),
  ('sports', 'Darts', 30),
  ('sports', 'Horse Racing', 31),
  ('sports', 'Motorsport', 32),
  ('sports', 'Sailing', 33),
  ('sports', 'Climbing', 34),
  ('sports', 'Rowing', 35),
  ('sports', 'Fencing', 36),
  ('sports', 'Weightlifting', 37),
  ('sports', 'Archery', 38),
  ('sports', 'Karate', 39),
  ('sports', 'Taekwondo', 40),
  ('sports', 'Judo', 41),
  ('sports', 'Wushu', 42),
  ('sports', 'Figure Skating', 43),
  ('sports', 'Curling', 44),
  ('sports', 'Water Polo', 45),
  ('sports', 'Billiards', 46),
  ('sports', 'Pickleball', 47)
ON CONFLICT (main_category_id, name) DO NOTHING;

-- Step 11: Seed Comics sub-categories
INSERT INTO sub_categories (main_category_id, name, sort_order) VALUES
  ('comics', 'Marvel Comics', 1),
  ('comics', 'DC Comics', 2),
  ('comics', 'Image Comics', 3),
  ('comics', 'Dark Horse Comics', 4),
  ('comics', 'IDW Publishing', 5),
  ('comics', 'Boom! Studios', 6),
  ('comics', 'Dynamite Entertainment', 7),
  ('comics', 'Valiant Comics', 8),
  ('comics', 'Archie Comics', 9),
  ('comics', 'Skybound Entertainment', 10),
  ('comics', 'Oni Press', 11),
  ('comics', 'AfterShock Comics', 12),
  ('comics', 'AWA (Artists, Writers & Artisans)', 13),
  ('comics', 'Vault Comics', 14),
  ('comics', 'Titan Comics', 15),
  ('comics', 'Humanoids', 16),
  ('comics', 'Scout Comics', 17),
  ('comics', 'Ahoy Comics', 18),
  ('comics', 'Black Mask Studios', 19),
  ('comics', 'Mad Cave Studios', 20)
ON CONFLICT (main_category_id, name) DO NOTHING;