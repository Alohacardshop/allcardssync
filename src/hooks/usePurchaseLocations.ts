import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PurchaseLocation {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  sort_order: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function usePurchaseLocations() {
  return useQuery({
    queryKey: ['purchase-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_locations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as PurchaseLocation[];
    },
  });
}

export function useAllPurchaseLocations() {
  return useQuery({
    queryKey: ['purchase-locations-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_locations')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as PurchaseLocation[];
    },
  });
}

export function useAddPurchaseLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (location: Omit<PurchaseLocation, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('purchase_locations')
        .insert(location)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-locations'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-locations-all'] });
      toast.success('Purchase location added successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add purchase location');
    },
  });
}

export function useUpdatePurchaseLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PurchaseLocation> & { id: string }) => {
      const { data, error } = await supabase
        .from('purchase_locations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-locations'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-locations-all'] });
      toast.success('Purchase location updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update purchase location');
    },
  });
}

export function useDeletePurchaseLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('purchase_locations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-locations'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-locations-all'] });
      toast.success('Purchase location deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete purchase location');
    },
  });
}
