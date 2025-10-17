import { supabase } from '@/integrations/supabase/client';

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
      console.warn('[printer_config] No authenticated user');
      return getLocalStorageConfig();
    }

    // Check cache
    const now = Date.now();
    if (
      configCache &&
      configCache.userId === user.id &&
      configCache.storeKey === storeKey &&
      configCache.locationGid === locationGid &&
      now - configCache.timestamp < CACHE_DURATION
    ) {
      return configCache.config;
    }

    // Query user_printer_preferences
    let query = supabase
      .from('user_printer_preferences')
      .select('*')
      .eq('user_id', user.id);

    if (storeKey) {
      query = query.eq('store_key', storeKey);
    }
    if (locationGid) {
      query = query.eq('location_gid', locationGid);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[printer_config] Error fetching preferences:', error);
      return getLocalStorageConfig();
    }

    if (!data) {
      console.warn('[printer_config] No preferences found, falling back to localStorage');
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
      storeKey: storeKey || null,
      locationGid: locationGid || null,
      timestamp: now,
    };

    return config;
  } catch (error) {
    console.error('[printer_config] Unexpected error:', error);
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
    console.error('[printer_config] Error reading localStorage:', error);
    return null;
  }
}

export function clearPrinterConfigCache(): void {
  configCache = null;
}
