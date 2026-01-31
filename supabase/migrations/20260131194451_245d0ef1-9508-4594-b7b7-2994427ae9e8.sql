-- Allow staff and admin to insert into pending_notifications for testing
CREATE POLICY "Staff can insert pending_notifications"
ON public.pending_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Allow staff and admin to update pending_notifications
CREATE POLICY "Staff can update pending_notifications"
ON public.pending_notifications
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);