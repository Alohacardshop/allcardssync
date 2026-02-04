-- Inventory Write Locks for bulk operations
-- Prevents race conditions during transfers, recounts, and reconciliation

CREATE TABLE public.inventory_write_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL,
  store_key TEXT NOT NULL,
  lock_type TEXT NOT NULL CHECK (lock_type IN ('bulk_transfer', 'recount', 'reconciliation', 'manual_adjustment')),
  locked_by TEXT, -- user_id or system identifier
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  context JSONB DEFAULT '{}', -- Additional context like transfer_id, batch_id
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Simple unique constraint - we clean up expired locks before inserting
  CONSTRAINT unique_active_lock UNIQUE (sku, store_key)
);

-- Index for cleanup queries
CREATE INDEX idx_inventory_locks_expires 
  ON public.inventory_write_locks (expires_at);

-- Index for querying by lock type
CREATE INDEX idx_inventory_locks_type 
  ON public.inventory_write_locks (lock_type, store_key);

-- Index for batch release
CREATE INDEX idx_inventory_locks_batch 
  ON public.inventory_write_locks ((context->>'batch_id'));

-- Enable RLS
ALTER TABLE public.inventory_write_locks ENABLE ROW LEVEL SECURITY;

-- Staff and admin can manage locks
CREATE POLICY "Staff can view inventory locks"
  ON public.inventory_write_locks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Staff can create inventory locks"
  ON public.inventory_write_locks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Staff can delete inventory locks"
  ON public.inventory_write_locks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'staff')
    )
  );

-- Function to acquire locks for multiple SKUs atomically
-- Cleans up expired locks first, then attempts to insert new ones
CREATE OR REPLACE FUNCTION public.acquire_inventory_locks(
  p_skus TEXT[],
  p_store_key TEXT,
  p_lock_type TEXT,
  p_locked_by TEXT,
  p_timeout_minutes INTEGER DEFAULT 15,
  p_context JSONB DEFAULT '{}'
)
RETURNS TABLE (
  acquired_count INTEGER,
  failed_skus TEXT[],
  lock_batch_id UUID
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_expires_at TIMESTAMP WITH TIME ZONE := now() + (p_timeout_minutes || ' minutes')::INTERVAL;
  v_acquired INTEGER := 0;
  v_failed TEXT[] := '{}';
  v_sku TEXT;
BEGIN
  -- Clean up ALL expired locks first (global cleanup)
  DELETE FROM inventory_write_locks WHERE expires_at < now();
  
  -- Try to acquire each lock
  FOREACH v_sku IN ARRAY p_skus LOOP
    BEGIN
      INSERT INTO inventory_write_locks (sku, store_key, lock_type, locked_by, expires_at, context)
      VALUES (v_sku, p_store_key, p_lock_type, p_locked_by, v_expires_at, p_context || jsonb_build_object('batch_id', v_batch_id));
      v_acquired := v_acquired + 1;
    EXCEPTION WHEN unique_violation THEN
      v_failed := array_append(v_failed, v_sku);
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_acquired, v_failed, v_batch_id;
END;
$$;

-- Function to release locks by batch or individual SKUs
CREATE OR REPLACE FUNCTION public.release_inventory_locks(
  p_batch_id UUID DEFAULT NULL,
  p_skus TEXT[] DEFAULT NULL,
  p_store_key TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  IF p_batch_id IS NOT NULL THEN
    DELETE FROM inventory_write_locks 
    WHERE context->>'batch_id' = p_batch_id::TEXT;
  ELSIF p_skus IS NOT NULL AND p_store_key IS NOT NULL THEN
    DELETE FROM inventory_write_locks 
    WHERE sku = ANY(p_skus) AND store_key = p_store_key;
  ELSE
    RAISE EXCEPTION 'Must provide either batch_id or (skus + store_key)';
  END IF;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

-- Function to check if SKUs are locked (returns only currently active locks)
CREATE OR REPLACE FUNCTION public.check_inventory_locks(
  p_skus TEXT[],
  p_store_key TEXT
)
RETURNS TABLE (
  sku TEXT,
  is_locked BOOLEAN,
  lock_type TEXT,
  locked_by TEXT,
  expires_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.sku,
    (l.id IS NOT NULL AND l.expires_at > now()) AS is_locked,
    l.lock_type,
    l.locked_by,
    l.expires_at
  FROM unnest(p_skus) AS s(sku)
  LEFT JOIN inventory_write_locks l 
    ON l.sku = s.sku 
    AND l.store_key = p_store_key
    AND l.expires_at > now();
END;
$$;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.acquire_inventory_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_inventory_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_inventory_locks TO authenticated;