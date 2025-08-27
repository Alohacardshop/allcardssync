-- Check if sets table exists and create if needed
CREATE TABLE IF NOT EXISTS public.sets (
  id text PRIMARY KEY,
  game text NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  name text NOT NULL,
  released_at date,
  cards_count integer,
  raw jsonb,
  discovered_at timestamptz DEFAULT now()
);

-- Enable RLS on sets table
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sets table
CREATE POLICY "Public read access for sets" 
ON public.sets 
FOR SELECT 
USING (true);

CREATE POLICY "Admin write access for sets" 
ON public.sets 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));