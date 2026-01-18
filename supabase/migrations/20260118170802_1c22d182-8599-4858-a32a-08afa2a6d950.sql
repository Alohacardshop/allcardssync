-- Add unique constraints for policy upsert to work correctly
ALTER TABLE public.ebay_fulfillment_policies 
  ADD CONSTRAINT ebay_fulfillment_policies_store_policy_unique 
  UNIQUE (store_key, policy_id);

ALTER TABLE public.ebay_payment_policies 
  ADD CONSTRAINT ebay_payment_policies_store_policy_unique 
  UNIQUE (store_key, policy_id);

ALTER TABLE public.ebay_return_policies 
  ADD CONSTRAINT ebay_return_policies_store_policy_unique 
  UNIQUE (store_key, policy_id);