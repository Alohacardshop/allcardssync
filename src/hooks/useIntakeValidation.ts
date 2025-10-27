import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLogger } from './useLogger';
import { validateCompleteStoreContext } from '@/utils/storeValidation';

/**
 * Custom hook to handle common intake validation logic
 * Provides store context validation and access checks
 */
export function useIntakeValidation() {
  const { assignedStore, selectedLocation } = useStore();
  const logger = useLogger('IntakeValidation');

  /**
   * Validate that store context is complete and user has access
   * @param actionDescription - Description of the action being performed (for error messages)
   * @returns Promise that resolves if validation passes, rejects with error message if not
   */
  const validateAccess = async (actionDescription: string = 'add item'): Promise<void> => {
    // Check store context exists
    if (!assignedStore || !selectedLocation) {
      const errorMsg = 'Store location not set. Please refresh the page.';
      logger.logError(`Cannot ${actionDescription} - store context missing`, undefined, {
        assignedStore,
        selectedLocation,
      });
      
      toast.error('Store/Location Required', {
        description: errorMsg,
      });
      
      throw new Error(errorMsg);
    }

    // Validate complete store context using utility
    try {
      validateCompleteStoreContext(
        { assignedStore, selectedLocation },
        actionDescription
      );
    } catch (error) {
      logger.logError(`Store context validation failed for ${actionDescription}`, error instanceof Error ? error : undefined, {
        assignedStore,
        selectedLocation,
      });
      throw error;
    }

    logger.logInfo(`Validated access for ${actionDescription}`, {
      store: assignedStore,
      location: selectedLocation,
    });
  };

  /**
   * Check user's intake access via RPC function (debug mode)
   * @param userId - User ID to check access for
   * @returns Promise with access check result
   */
  const checkIntakeAccess = async (userId: string) => {
    if (!assignedStore || !selectedLocation) {
      throw new Error('Store context missing');
    }

    const storeKeyTrimmed = assignedStore.trim();
    const locationGidTrimmed = selectedLocation.trim();

    logger.logInfo('Checking intake access', {
      userId,
      store: storeKeyTrimmed,
      location: locationGidTrimmed,
    });

    const { data: debugResult, error: debugError } = await supabase.rpc(
      'debug_eval_intake_access',
      {
        _user_id: userId,
        _store_key: storeKeyTrimmed,
        _location_gid: locationGidTrimmed,
      }
    );

    if (debugError) {
      logger.logError('Access check RPC failed', debugError instanceof Error ? debugError : new Error(String(debugError)), {
        userId,
        store: storeKeyTrimmed,
        location: locationGidTrimmed,
      });
      throw debugError;
    }

    const result = debugResult as { can_add?: boolean; reason?: string } | null;

    if (!result?.can_add) {
      const reason = result?.reason || 'Access denied';
      logger.logWarn('Access denied', {
        userId,
        store: storeKeyTrimmed,
        location: locationGidTrimmed,
        reason,
      });
      
      toast.error('Access Denied', {
        description: reason,
      });
      
      throw new Error(reason);
    }

    logger.logInfo('Access check passed', {
      userId,
      store: storeKeyTrimmed,
      location: locationGidTrimmed,
    });

    return result;
  };

  return {
    assignedStore,
    selectedLocation,
    validateAccess,
    checkIntakeAccess,
    hasStoreContext: Boolean(assignedStore && selectedLocation),
  };
}
