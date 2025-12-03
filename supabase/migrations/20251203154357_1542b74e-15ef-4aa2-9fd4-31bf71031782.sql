-- Create table for eBay fulfillment policies (shipping)
CREATE TABLE public.ebay_fulfillment_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_key text NOT NULL,
  policy_id text NOT NULL,
  name text NOT NULL,
  description text,
  marketplace_id text NOT NULL,
  shipping_options jsonb,
  handling_time jsonb,
  is_default boolean DEFAULT false,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(store_key, policy_id)
);

-- Create table for eBay payment policies
CREATE TABLE public.ebay_payment_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_key text NOT NULL,
  policy_id text NOT NULL,
  name text NOT NULL,
  description text,
  marketplace_id text NOT NULL,
  payment_methods jsonb,
  is_default boolean DEFAULT false,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(store_key, policy_id)
);

-- Create table for eBay return policies
CREATE TABLE public.ebay_return_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_key text NOT NULL,
  policy_id text NOT NULL,
  name text NOT NULL,
  description text,
  marketplace_id text NOT NULL,
  returns_accepted boolean DEFAULT true,
  return_period text,
  refund_method text,
  is_default boolean DEFAULT false,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(store_key, policy_id)
);

-- Enable RLS on all tables
ALTER TABLE public.ebay_fulfillment_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_payment_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_return_policies ENABLE ROW LEVEL SECURITY;

-- RLS policies for ebay_fulfillment_policies
CREATE POLICY "Admins can manage ebay_fulfillment_policies"
  ON public.ebay_fulfillment_policies FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_fulfillment_policies"
  ON public.ebay_fulfillment_policies FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for ebay_payment_policies
CREATE POLICY "Admins can manage ebay_payment_policies"
  ON public.ebay_payment_policies FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_payment_policies"
  ON public.ebay_payment_policies FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for ebay_return_policies
CREATE POLICY "Admins can manage ebay_return_policies"
  ON public.ebay_return_policies FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_return_policies"
  ON public.ebay_return_policies FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at triggers
CREATE TRIGGER update_ebay_fulfillment_policies_updated_at
  BEFORE UPDATE ON public.ebay_fulfillment_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ebay_payment_policies_updated_at
  BEFORE UPDATE ON public.ebay_payment_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ebay_return_policies_updated_at
  BEFORE UPDATE ON public.ebay_return_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();