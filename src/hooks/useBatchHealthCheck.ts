import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLogger } from '@/hooks/useLogger';

export interface BatchHealthReport {
  orphanedItems: number;
  orphanedLots: number;
  recentInvisibleItems: number;
  itemsWithoutLot: {
    id: string;
    subject: string;
    created_at: string;
    store_key: string;
  }[];
  lotsWithNoItems: {
    id: string;
    lot_number: string;
    created_at: string;
  }[];
  timestamp: string;
}

interface HealthCheckParams {
  storeKey?: string | null;
  locationGid?: string | null;
  userId?: string;
}

export const useBatchHealthCheck = ({ storeKey, locationGid, userId }: HealthCheckParams) => {
  const logger = useLogger('useBatchHealthCheck');
  const [isChecking, setIsChecking] = useState(false);
  const [report, setReport] = useState<BatchHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async (): Promise<BatchHealthReport | null> => {
    if (!storeKey || !locationGid || !userId) {
      setError('Missing required context (store, location, or user)');
      return null;
    }

    setIsChecking(true);
    setError(null);

    try {
      logger.logInfo('Starting batch health check', { storeKey, locationGid, userId });

      // 1. Find items without lot_id that should have one (recent manual intake items)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: orphanedItems, error: orphanErr } = await supabase
        .from('intake_items')
        .select('id, subject, created_at, store_key, created_by')
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid)
        .eq('created_by', userId)
        .is('lot_id', null)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null)
        .gte('created_at', oneHourAgo)
        .order('created_at', { ascending: false })
        .limit(10);

      if (orphanErr) {
        logger.logError('Failed to check orphaned items', orphanErr);
      }

      // 2. Find lots with no items (orphaned lots) - using direct query
      const { data: activeLots } = await supabase
        .from('intake_lots')
        .select('id, lot_number, created_at, total_items')
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid)
        .eq('created_by', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(5);
      
      // Filter to lots with 0 items
      const orphanedLots = (activeLots || [])
        .filter(lot => lot.total_items === 0)
        .map(lot => ({ id: lot.id, lot_number: lot.lot_number, created_at: lot.created_at }));

      // 3. Count total items that should be visible but aren't
      const { count: recentInvisibleCount } = await supabase
        .from('intake_items')
        .select('*', { count: 'exact', head: true })
        .eq('store_key', storeKey)
        .eq('shopify_location_gid', locationGid)
        .eq('created_by', userId)
        .is('lot_id', null)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null)
        .gte('created_at', oneHourAgo);

      const healthReport: BatchHealthReport = {
        orphanedItems: orphanedItems?.length || 0,
        orphanedLots: orphanedLots.length,
        recentInvisibleItems: recentInvisibleCount || 0,
        itemsWithoutLot: (orphanedItems || []).map(item => ({
          id: item.id,
          subject: item.subject || 'Unknown',
          created_at: item.created_at,
          store_key: item.store_key || ''
        })),
        lotsWithNoItems: orphanedLots,
        timestamp: new Date().toISOString()
      };

      logger.logInfo('Batch health check complete', healthReport);
      console.log('[BatchHealthCheck] 🏥 Health Report:', healthReport);

      setReport(healthReport);
      return healthReport;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.logWarn('Health check failed', { message });
      setError(message);
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const hasIssues = report && (
    report.orphanedItems > 0 || 
    report.orphanedLots > 0 || 
    report.recentInvisibleItems > 0
  );

  return {
    runHealthCheck,
    isChecking,
    report,
    error,
    hasIssues
  };
};
