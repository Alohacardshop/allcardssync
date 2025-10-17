import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useStore } from '@/contexts/StoreContext';
import { toast } from 'sonner';

export interface UserPrinterPreference {
  id: string;
  user_id: string;
  printer_type: 'zebra' | 'printnode';
  printer_id?: string;
  printer_name?: string;
  printer_ip?: string;
  printer_port?: number;
  store_key?: string;
  location_gid?: string;
}

export function useUserPrinterPreferences() {
  const { assignedStore, selectedLocation } = useStore();
  const [preference, setPreference] = useState<UserPrinterPreference | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user's printer preference for current store/location
  useEffect(() => {
    loadPreference();
  }, [assignedStore, selectedLocation]);

  const loadPreference = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setPreference(null);
        return;
      }

      const { data, error } = await supabase
        .from('user_printer_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('store_key', assignedStore || '')
        .eq('location_gid', selectedLocation || '')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setPreference(data as UserPrinterPreference | null);
    } catch (error) {
      console.error('Error loading printer preference:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreference = async (printerData: {
    printer_type: 'zebra' | 'printnode';
    printer_id?: string;
    printer_name?: string;
    printer_ip?: string;
    printer_port?: number;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!assignedStore || !selectedLocation) {
        throw new Error('Store and location must be selected');
      }

      const preferenceData = {
        user_id: user.id,
        store_key: assignedStore,
        location_gid: selectedLocation,
        ...printerData,
      };

      const { data, error } = await supabase
        .from('user_printer_preferences')
        .upsert(preferenceData, {
          onConflict: 'user_id,store_key,location_gid'
        })
        .select()
        .single();

      if (error) throw error;

      setPreference(data as UserPrinterPreference);
      toast.success('Default printer saved for this location');
      
      return data;
    } catch (error) {
      console.error('Error saving printer preference:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save printer preference');
      throw error;
    }
  };

  const clearPreference = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !assignedStore || !selectedLocation) return;

      const { error } = await supabase
        .from('user_printer_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('store_key', assignedStore)
        .eq('location_gid', selectedLocation);

      if (error) throw error;

      setPreference(null);
      toast.success('Default printer cleared for this location');
    } catch (error) {
      console.error('Error clearing printer preference:', error);
      toast.error('Failed to clear printer preference');
    }
  };

  return {
    preference,
    isLoading,
    savePreference,
    clearPreference,
    loadPreference,
  };
}
