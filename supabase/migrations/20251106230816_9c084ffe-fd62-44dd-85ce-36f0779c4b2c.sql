-- ============================================
-- CARD SHOW TOOL - PRODUCTION READINESS FIXES (Safe)
-- ============================================

-- 1. CREATE user_profiles TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  default_show_id UUID REFERENCES public.shows(id) ON DELETE SET NULL,
  default_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on user_profiles (safe if already enabled)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles (using DO block to check if exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' 
    AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
      ON public.user_profiles
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' 
    AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON public.user_profiles
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
      ON public.user_profiles
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger function for auto-creating profile
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger to ensure it's correct
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- 2. ADD FOREIGN KEY CONSTRAINTS (check if they exist first)
-- ============================================
DO $$
BEGIN
  -- card_transactions -> alt_items foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'card_transactions_alt_item_id_fkey'
    AND table_name = 'card_transactions'
  ) THEN
    ALTER TABLE public.card_transactions
      ADD CONSTRAINT card_transactions_alt_item_id_fkey
      FOREIGN KEY (alt_item_id)
      REFERENCES public.alt_items(id)
      ON DELETE CASCADE;
  END IF;

  -- card_transactions -> shows foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'card_transactions_show_id_fkey'
    AND table_name = 'card_transactions'
  ) THEN
    ALTER TABLE public.card_transactions
      ADD CONSTRAINT card_transactions_show_id_fkey
      FOREIGN KEY (show_id)
      REFERENCES public.shows(id)
      ON DELETE SET NULL;
  END IF;

  -- shows -> locations foreign key
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'shows_location_id_fkey'
    AND table_name = 'shows'
  ) THEN
    ALTER TABLE public.shows
      ADD CONSTRAINT shows_location_id_fkey
      FOREIGN KEY (location_id)
      REFERENCES public.locations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. ADD DATA VALIDATION CONSTRAINTS (check if they exist first)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'card_transactions_price_positive'
    AND table_name = 'card_transactions'
  ) THEN
    ALTER TABLE public.card_transactions
      ADD CONSTRAINT card_transactions_price_positive
      CHECK (price IS NULL OR price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'alt_items_alt_value_positive'
    AND table_name = 'alt_items'
  ) THEN
    ALTER TABLE public.alt_items
      ADD CONSTRAINT alt_items_alt_value_positive
      CHECK (alt_value IS NULL OR alt_value >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'shows_valid_dates'
    AND table_name = 'shows'
  ) THEN
    ALTER TABLE public.shows
      ADD CONSTRAINT shows_valid_dates
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'card_transactions_txn_type_valid'
    AND table_name = 'card_transactions'
  ) THEN
    ALTER TABLE public.card_transactions
      ADD CONSTRAINT card_transactions_txn_type_valid
      CHECK (txn_type IN ('BUY', 'SELL'));
  END IF;
END $$;

-- 4. ADD PERFORMANCE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_alt_items_alt_uuid 
  ON public.alt_items(alt_uuid) WHERE alt_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alt_items_title 
  ON public.alt_items USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS idx_card_transactions_alt_item_id 
  ON public.card_transactions(alt_item_id);

CREATE INDEX IF NOT EXISTS idx_card_transactions_show_id 
  ON public.card_transactions(show_id);

CREATE INDEX IF NOT EXISTS idx_card_transactions_txn_date 
  ON public.card_transactions(txn_date DESC);

CREATE INDEX IF NOT EXISTS idx_shows_location_id 
  ON public.shows(location_id);

CREATE INDEX IF NOT EXISTS idx_shows_start_date 
  ON public.shows(start_date DESC);

-- 5. ADD TRIGGER FOR user_profiles updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. ADD UNIQUE CONSTRAINT FOR DUPLICATE PREVENTION
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_alt_items_unique_alt_uuid
  ON public.alt_items(alt_uuid)
  WHERE alt_uuid IS NOT NULL AND alt_uuid != '';