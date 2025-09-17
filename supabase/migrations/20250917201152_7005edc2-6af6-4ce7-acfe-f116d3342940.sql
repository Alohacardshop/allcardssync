-- Create admin function to clear shopify sync queue
CREATE OR REPLACE FUNCTION public.admin_clear_shopify_sync_queue(clear_type text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Only allow admins to clear the queue
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required to clear sync queue';
  END IF;
  
  -- Clear based on type
  CASE clear_type
    WHEN 'all' THEN
      DELETE FROM public.shopify_sync_queue;
    WHEN 'completed' THEN
      DELETE FROM public.shopify_sync_queue WHERE status = 'completed';
    WHEN 'failed' THEN
      DELETE FROM public.shopify_sync_queue WHERE status = 'failed';
    WHEN 'queued' THEN
      DELETE FROM public.shopify_sync_queue WHERE status = 'queued';
    ELSE
      RAISE EXCEPTION 'Invalid clear_type. Use: all, completed, failed, or queued';
  END CASE;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the action
  INSERT INTO public.system_logs (level, message, context)
  VALUES (
    'info',
    'Admin cleared shopify sync queue',
    jsonb_build_object(
      'clear_type', clear_type,
      'deleted_count', deleted_count,
      'admin_user_id', auth.uid()
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'clear_type', clear_type
  );
END;
$$;