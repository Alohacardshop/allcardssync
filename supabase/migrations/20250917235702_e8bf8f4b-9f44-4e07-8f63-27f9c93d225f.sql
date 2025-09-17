-- Add DELETE policy for admins to manage shopify sync queue
CREATE POLICY "Admins can delete from sync queue" ON public.shopify_sync_queue
  FOR DELETE
  TO public
  USING (
    auth.uid() IS NOT NULL 
    AND has_role(auth.uid(), 'admin'::app_role)
  );