import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface PrinterConfig {
  usePrintNode: boolean;
  printNodeId: number | null;
  printerName?: string;
}

// Cache to avoid repeated DB queries during batch operations
let configCache: {
  config: PrinterConfig | null;
  userId: string | null;
  storeKey: string | null;
  locationGid: string | null;
  timestamp: number;
} | null = null;

const CACHE_DURATION = 5000; // 5 seconds

export async function getPrinterConfig(
  storeKey?: string,
  locationGid?: string
): Promise<PrinterConfig | null> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.warn('No authenticated user', undefined, 'printer-config');
      return getLocalStorageConfig();
    }

    // If store/location not provided, try to auto-detect from context
    let effectiveStore = storeKey;
    let effectiveLocation = locationGid;

    if (!effectiveStore || !effectiveLocation) {
      // Try to get from localStorage (where StoreContext saves them)
      const savedLocation = localStorage.getItem('selected_shopify_location');
      
      // Get user's default store assignment
      const { data: assignments } = await supabase
        .from('user_shopify_assignments')
        .select('store_key, location_gid, is_default')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignments) {
        effectiveStore = effectiveStore || assignments.store_key;
        effectiveLocation = effectiveLocation || savedLocation || assignments.location_gid;
        
        logger.debug('Auto-detected store/location', {
          store: effectiveStore,
          location: effectiveLocation
        }, 'printer-config');
      }
    }

    // Check cache
    const now = Date.now();
    if (
      configCache &&
      configCache.userId === user.id &&
      configCache.storeKey === effectiveStore &&
      configCache.locationGid === effectiveLocation &&
      now - configCache.timestamp < CACHE_DURATION
    ) {
      return configCache.config;
    }

    // Query user_printer_preferences
    let query = supabase
      .from('user_printer_preferences')
      .select('*')
      .eq('user_id', user.id);

    if (effectiveStore) {
      query = query.eq('store_key', effectiveStore);
    }
    if (effectiveLocation) {
      query = query.eq('location_gid', effectiveLocation);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      logger.error('Error fetching preferences', error instanceof Error ? error : new Error(String(error)), undefined, 'printer-config');
      return getLocalStorageConfig();
    }

    if (!data) {
      logger.warn('No preferences found, falling back to localStorage', undefined, 'printer-config');
      return getLocalStorageConfig();
    }

    // Build config from preferences
    const config: PrinterConfig = {
      usePrintNode: data.printer_type === 'printnode',
      printNodeId: data.printer_id ? parseInt(data.printer_id) : null,
      printerName: data.printer_name || undefined,
    };

    // Update cache
    configCache = {
      config,
      userId: user.id,
      storeKey: effectiveStore || null,
      locationGid: effectiveLocation || null,
      timestamp: now,
    };

    logger.debug('Loaded printer config', {
      usePrintNode: config.usePrintNode,
      printerId: config.printNodeId,
      printerName: config.printerName,
      store: effectiveStore,
      location: effectiveLocation
    }, 'printer-config');

    return config;
  } catch (error) {
    logger.error('Unexpected error', error instanceof Error ? error : new Error(String(error)), undefined, 'printer-config');
    return getLocalStorageConfig();
  }
}

function getLocalStorageConfig(): PrinterConfig | null {
  try {
    const savedConfig = localStorage.getItem('zebra-printer-config');
    if (!savedConfig) {
      return null;
    }
    const config = JSON.parse(savedConfig);
    return {
      usePrintNode: config.usePrintNode || false,
      printNodeId: config.printNodeId || null,
      printerName: config.printerName,
    };
  } catch (error) {
    logger.error('Error reading localStorage', error instanceof Error ? error : new Error(String(error)), undefined, 'printer-config');
    return null;
  }
}

export function clearPrinterConfigCache(): void {
  configCache = null;
}
