-- Create games table for JustTCG integration
CREATE TABLE IF NOT EXISTS public.justtcg_games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.justtcg_games ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage games" ON public.justtcg_games
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view games" ON public.justtcg_games
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add update trigger
CREATE TRIGGER update_justtcg_games_updated_at
  BEFORE UPDATE ON public.justtcg_games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();