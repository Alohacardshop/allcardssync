-- Add function to refresh/extend lock timeout
CREATE OR REPLACE FUNCTION public.refresh_inventory_locks(
  p_batch_id UUID DEFAULT NULL,
  p_skus TEXT[] DEFAULT NULL,
  p_store_key TEXT DEFAULT NULL,
  p_extend_minutes INTEGER DEFAULT 15
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refreshed INTEGER;
  v_new_expires TIMESTAMP WITH TIME ZONE := now() + (p_extend_minutes || ' minutes')::INTERVAL;
BEGIN
  IF p_batch_id IS NOT NULL THEN
    UPDATE inventory_write_locks 
    SET expires_at = v_new_expires
    WHERE context->>'batch_id' = p_batch_id::TEXT
      AND expires_at > now(); -- Only refresh non-expired locks
  ELSIF p_skus IS NOT NULL AND p_store_key IS NOT NULL THEN
    UPDATE inventory_write_locks 
    SET expires_at = v_new_expires
    WHERE sku = ANY(p_skus) 
      AND store_key = p_store_key
      AND expires_at > now();
  ELSE
    RAISE EXCEPTION 'Must provide either batch_id or (skus + store_key)';
  END IF;
  
  GET DIAGNOSTICS v_refreshed = ROW_COUNT;
  RETURN v_refreshed;
END;
$$;

-- Add function for admin to force-clear locks (any lock, even non-expired)
CREATE OR REPLACE FUNCTION public.force_release_inventory_locks(
  p_lock_ids UUID[] DEFAULT NULL,
  p_skus TEXT[] DEFAULT NULL,
  p_store_key TEXT DEFAULT NULL,
  p_lock_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_released INTEGER;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can force-release locks';
  END IF;

  IF p_lock_ids IS NOT NULL THEN
    -- Release by specific lock IDs
    DELETE FROM inventory_write_locks 
    WHERE id = ANY(p_lock_ids);
  ELSIF p_skus IS NOT NULL AND p_store_key IS NOT NULL THEN
    -- Release by SKUs + store
    DELETE FROM inventory_write_locks 
    WHERE sku = ANY(p_skus) AND store_key = p_store_key;
  ELSIF p_lock_type IS NOT NULL AND p_store_key IS NOT NULL THEN
    -- Release all locks of a type for a store
    DELETE FROM inventory_write_locks 
    WHERE lock_type = p_lock_type AND store_key = p_store_key;
  ELSIF p_store_key IS NOT NULL THEN
    -- Release all locks for a store
    DELETE FROM inventory_write_locks 
    WHERE store_key = p_store_key;
  ELSE
    RAISE EXCEPTION 'Must provide lock_ids, or (skus + store_key), or (lock_type + store_key), or store_key';
  END IF;
  
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;

-- Add function to check if a single SKU is locked (fast path)
CREATE OR REPLACE FUNCTION public.is_sku_locked(
  p_sku TEXT,
  p_store_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM inventory_write_locks
    WHERE sku = p_sku 
      AND store_key = p_store_key
      AND expires_at > now()
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.refresh_inventory_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_release_inventory_locks TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sku_locked TO authenticated;