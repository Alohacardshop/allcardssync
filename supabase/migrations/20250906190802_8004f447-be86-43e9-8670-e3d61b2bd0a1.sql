
-- Allow non-staff users to view only the stores they are assigned to
create policy "Users can view their assigned stores"
on public.shopify_stores
for select
using (
  exists (
    select 1
    from public.user_shopify_assignments usa
    where usa.user_id = auth.uid()
      and usa.store_key = shopify_stores.key
  )
);
