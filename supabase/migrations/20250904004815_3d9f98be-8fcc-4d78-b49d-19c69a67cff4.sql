-- Add RLS policies for catalog_v2 tables
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;
alter table catalog_v2.variants enable row level security;

-- Allow staff/admin to read catalog data
create policy "Staff can view sets" on catalog_v2.sets for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
create policy "Staff can view cards" on catalog_v2.cards for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));  
create policy "Staff can view variants" on catalog_v2.variants for select using (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));