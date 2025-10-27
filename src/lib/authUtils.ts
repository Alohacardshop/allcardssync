import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from '@/lib/logger';

export const cleanupAuthState = () => {
  // Remove standard auth tokens
  localStorage.removeItem('supabase.auth.token');
  // Remove all Supabase auth keys from localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      localStorage.removeItem(key);
    }
  });
  // Remove from sessionStorage if in use
  Object.keys(sessionStorage || {}).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      sessionStorage.removeItem(key);
    }
  });
};

export const resetLogin = async () => {
  try {
    cleanupAuthState();
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/auth';
  } catch (error) {
    logger.error('Error during reset login', error as Error, undefined, 'auth');
    window.location.href = '/auth';
  }
};

export const invokeWithRetry = async (functionName: string, options: any = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, options);
    if (error) throw error;
    return { data, error: null };
  } catch (error: any) {
    // Check if it's an auth/JWT error
    if (error?.message?.includes('JWT') || error?.message?.includes('401') || error?.status === 401) {
      logger.info('JWT expired, attempting to refresh session', { functionName }, 'auth');
      
      try {
        // Try to refresh the session
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        
        // Retry the function call once
        const { data, error: retryError } = await supabase.functions.invoke(functionName, options);
        if (retryError) throw retryError;
        
        return { data, error: null };
      } catch (retryError) {
        logger.error('Retry after refresh failed', retryError as Error, { functionName }, 'auth');
        
        // Show toast with reset option
        toast.error('Session expired. Please sign in again.', {
          action: {
            label: 'Reset Login',
            onClick: resetLogin,
          },
        });
        
        throw retryError;
      }
    }
    
    // Re-throw non-auth errors as-is
    throw error;
  }
};
