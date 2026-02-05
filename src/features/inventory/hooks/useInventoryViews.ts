 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { toast } from 'sonner';
 import { useSession } from '@/hooks/useSession';
 import type { 
   SavedInventoryView, 
   CreateViewInput, 
   InventoryColumn, 
   SortField, 
   SortDirection,
   DEFAULT_SYSTEM_VIEWS
 } from '../types/views';
 import { INVENTORY_COLUMNS } from '../types/views';
 
 const VIEWS_QUERY_KEY = ['inventory-views'];
 
 /**
  * Hook to manage saved inventory views with Supabase persistence
  */
 export function useInventoryViews() {
   const queryClient = useQueryClient();
   const { data: session } = useSession();
   const userId = session?.user?.id;
 
   // Fetch all views for the current user
   const { data: views = [], isLoading } = useQuery({
     queryKey: [...VIEWS_QUERY_KEY, userId],
     queryFn: async () => {
       if (!userId) return [];
       
       const { data, error } = await supabase
         .from('user_inventory_views')
         .select('*')
         .eq('user_id', userId)
         .order('is_system', { ascending: false })
         .order('name');
       
       if (error) throw error;
       
       // Transform DB rows to our type
       return (data || []).map(row => ({
         id: row.id,
         user_id: row.user_id,
         name: row.name,
         is_default: row.is_default || false,
         is_system: row.is_system || false,
         filters: (row.filters as Record<string, unknown>) || {},
         visible_columns: (row.visible_columns || []) as InventoryColumn[],
         sort_column: row.sort_column as SortField | null,
         sort_direction: (row.sort_direction || 'desc') as SortDirection,
         created_at: row.created_at,
         updated_at: row.updated_at,
       })) as SavedInventoryView[];
     },
     enabled: !!userId,
     staleTime: 5 * 60 * 1000, // 5 minutes
   });
 
   // Get the default view
   const defaultView = views.find(v => v.is_default);
 
   // Create a new view
   const createView = useMutation({
     mutationFn: async (input: CreateViewInput) => {
       if (!userId) throw new Error('Not authenticated');
       
       const { data, error } = await supabase
         .from('user_inventory_views')
         .insert({
           user_id: userId,
           name: input.name,
           filters: input.filters,
           visible_columns: input.visible_columns,
           sort_column: input.sort_column || null,
           sort_direction: input.sort_direction || 'desc',
           is_default: input.is_default || false,
           is_system: false,
         })
         .select()
         .single();
       
       if (error) {
         if (error.code === '23505') {
           throw new Error('A view with this name already exists');
         }
         throw error;
       }
       
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: VIEWS_QUERY_KEY });
       toast.success('View saved');
     },
     onError: (error) => {
       toast.error(error.message);
     },
   });
 
   // Update an existing view
   const updateView = useMutation({
     mutationFn: async ({ 
       id, 
       ...updates 
     }: Partial<CreateViewInput> & { id: string }) => {
       if (!userId) throw new Error('Not authenticated');
       
       const { error } = await supabase
         .from('user_inventory_views')
         .update({
           ...updates,
           updated_at: new Date().toISOString(),
         })
         .eq('id', id)
         .eq('user_id', userId);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: VIEWS_QUERY_KEY });
       toast.success('View updated');
     },
     onError: (error) => {
       toast.error(error.message);
     },
   });
 
   // Delete a view
   const deleteView = useMutation({
     mutationFn: async (id: string) => {
       if (!userId) throw new Error('Not authenticated');
       
       const { error } = await supabase
         .from('user_inventory_views')
         .delete()
         .eq('id', id)
         .eq('user_id', userId)
         .eq('is_system', false); // Can't delete system views
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: VIEWS_QUERY_KEY });
       toast.success('View deleted');
     },
     onError: (error) => {
       toast.error(error.message);
     },
   });
 
   // Set a view as default
   const setDefaultView = useMutation({
     mutationFn: async (viewId: string | null) => {
       if (!userId) throw new Error('Not authenticated');
       
       // First, clear all defaults
       await supabase
         .from('user_inventory_views')
         .update({ is_default: false })
         .eq('user_id', userId);
       
       // Then set the new default
       if (viewId) {
         const { error } = await supabase
           .from('user_inventory_views')
           .update({ is_default: true })
           .eq('id', viewId)
           .eq('user_id', userId);
         
         if (error) throw error;
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: VIEWS_QUERY_KEY });
     },
     onError: (error) => {
       toast.error(error.message);
     },
   });
 
   // Initialize default system views for new users
   const initializeSystemViews = useMutation({
     mutationFn: async () => {
       if (!userId) throw new Error('Not authenticated');
       
       // Check if user already has views
       const { data: existing } = await supabase
         .from('user_inventory_views')
         .select('id')
         .eq('user_id', userId)
         .limit(1);
       
       if (existing && existing.length > 0) return; // Already initialized
       
       // Import default views
       const { DEFAULT_SYSTEM_VIEWS } = await import('../types/views');
       
       const systemViews = DEFAULT_SYSTEM_VIEWS.map(view => ({
         user_id: userId,
         name: view.name,
         is_default: view.is_default,
         is_system: view.is_system,
         filters: view.filters,
         visible_columns: view.visible_columns,
         sort_column: view.sort_column,
         sort_direction: view.sort_direction,
       }));
       
       const { error } = await supabase
         .from('user_inventory_views')
         .insert(systemViews);
       
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: VIEWS_QUERY_KEY });
     },
   });
 
   return {
     views,
     defaultView,
     isLoading,
     createView,
     updateView,
     deleteView,
     setDefaultView,
     initializeSystemViews,
   };
 }
 
 /**
  * Get default visible columns
  */
 export function getDefaultVisibleColumns(): InventoryColumn[] {
   return INVENTORY_COLUMNS
     .filter(c => c.defaultVisible)
     .map(c => c.id);
 }