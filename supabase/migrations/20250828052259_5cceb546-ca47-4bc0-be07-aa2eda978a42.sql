
-- 1) Mark sets as synced and skippable
ALTER TABLE catalog_v2.sets
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS last_sync_message text;

-- Helpful index for lookups by game/set and time
CREATE INDEX IF NOT EXISTS idx_sets_game_setid_last_synced_at
  ON catalog_v2.sets (game, set_id, last_synced_at DESC);

-- 2) Per-user saved selections and sync options
CREATE TABLE IF NOT EXISTS public.user_sync_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  -- persisted selections
  selected_games text[] NOT NULL DEFAULT '{}'::text[],
  selected_sets  text[] NOT NULL DEFAULT '{}'::text[],
  sets_game_filter text NOT NULL DEFAULT 'all',
  -- smart sync options
  only_new_sets boolean NOT NULL DEFAULT true,
  skip_recently_updated boolean NOT NULL DEFAULT true,
  force_resync boolean NOT NULL DEFAULT false,
  since_days integer NOT NULL DEFAULT 30,
  -- timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

-- keep updated_at fresh
CREATE TRIGGER user_sync_preferences_set_updated_at
BEFORE UPDATE ON public.user_sync_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.user_sync_preferences ENABLE ROW LEVEL SECURITY;

-- Policies:
-- Users can view their own preferences
CREATE POLICY "Users can view their own sync preferences"
  ON public.user_sync_preferences
  FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Users can create their own preferences
CREATE POLICY "Users can create their own sync preferences"
  ON public.user_sync_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Users can update their own preferences
CREATE POLICY "Users can update their own sync preferences"
  ON public.user_sync_preferences
  FOR UPDATE
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
