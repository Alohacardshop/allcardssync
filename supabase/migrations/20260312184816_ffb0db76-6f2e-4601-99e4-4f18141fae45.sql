
-- Shopify sync run summaries
CREATE TABLE public.shopify_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('single', 'bulk')),
  store_key TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  total_api_calls INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  triggered_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'partial_failure', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-item results within a run
CREATE TABLE public.shopify_sync_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.shopify_sync_runs(id) ON DELETE CASCADE,
  item_id UUID NOT NULL,
  sku TEXT,
  title TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  api_calls INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX idx_sync_runs_created_at ON public.shopify_sync_runs(created_at DESC);
CREATE INDEX idx_sync_runs_store_key ON public.shopify_sync_runs(store_key);
CREATE INDEX idx_sync_runs_batch_id ON public.shopify_sync_runs(batch_id);
CREATE INDEX idx_sync_runs_status ON public.shopify_sync_runs(status);
CREATE INDEX idx_sync_run_items_run_id ON public.shopify_sync_run_items(run_id);
CREATE INDEX idx_sync_run_items_success ON public.shopify_sync_run_items(success);
CREATE INDEX idx_sync_run_items_item_id ON public.shopify_sync_run_items(item_id);

-- RLS
ALTER TABLE public.shopify_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_sync_run_items ENABLE ROW LEVEL SECURITY;

-- Staff/admin can read
CREATE POLICY "Staff can read sync runs"
  ON public.shopify_sync_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff can read sync run items"
  ON public.shopify_sync_run_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Service role inserts (edge functions use service key)
CREATE POLICY "Service can insert sync runs"
  ON public.shopify_sync_runs FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Service can update sync runs"
  ON public.shopify_sync_runs FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service can insert sync run items"
  ON public.shopify_sync_run_items FOR INSERT TO service_role
  WITH CHECK (true);
