-- Add cost_each to trade_ins for tracking buy cost per unit
ALTER TABLE public.trade_ins
ADD COLUMN IF NOT EXISTS cost_each numeric;

-- Note: existing RLS policies already allow insert/update/select; no change needed.