
-- Grant EXECUTE privileges so app users can call these functions via RPC
GRANT EXECUTE ON FUNCTION public.soft_delete_intake_item(uuid, text) TO PUBLIC;

-- Optional helpers used elsewhere; grant for consistency
GRANT EXECUTE ON FUNCTION public.soft_delete_intake_items(uuid[], text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_intake_item(uuid, text) TO PUBLIC;

-- admin_delete_batch already had EXECUTE granted to PUBLIC, but this is idempotent
GRANT EXECUTE ON FUNCTION public.admin_delete_batch(uuid, text) TO PUBLIC;
