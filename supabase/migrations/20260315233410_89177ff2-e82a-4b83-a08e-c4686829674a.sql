
CREATE TABLE public.underpricing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_item_id uuid NOT NULL REFERENCES public.intake_items(id) ON DELETE CASCADE,
  sku text,
  our_price numeric NOT NULL,
  ebay_median numeric NOT NULL,
  difference_percent numeric NOT NULL,
  difference_dollars numeric NOT NULL,
  match_count integer NOT NULL,
  search_query text NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_item_id)
);

CREATE INDEX idx_underpricing_alerts_item ON public.underpricing_alerts(intake_item_id);
CREATE INDEX idx_underpricing_alerts_alerted ON public.underpricing_alerts(alerted_at);

ALTER TABLE public.underpricing_alerts ENABLE ROW LEVEL SECURITY;
