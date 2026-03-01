
-- Add policy and markup columns to tag_category_mappings
ALTER TABLE public.tag_category_mappings
  ADD COLUMN fulfillment_policy_id text,
  ADD COLUMN payment_policy_id text,
  ADD COLUMN return_policy_id text,
  ADD COLUMN price_markup_percent numeric;
