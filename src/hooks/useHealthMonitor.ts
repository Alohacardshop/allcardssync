import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import React from 'react';
import { logger } from '@/lib/logger';

export interface HealthStatus {
  database: 'healthy' | 'degraded' | 'down';
  shopifySync: 'healthy' | 'degraded' | 'down';
  printServices: 'healthy' | 'degraded' | 'down';
  lastSync: Date | null;
  queueBacklog: number;
  errorRate: number;
}

export function useHealthMonitor(liveMode: boolean = false) {
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);

  const checkSystemHealth = async (): Promise<HealthStatus> => {
    try {
      // Check database connectivity
      const { data: dbTest, error: dbError } = await supabase
        .from('system_logs')
        .select('id')
        .limit(1);

      const databaseHealth: HealthStatus['database'] = dbError ? 'down' : 'healthy';

      // Check Shopify sync health
      const { data: syncStatus, error: syncError } = await supabase
        .from('shopify_sync_queue')
        .select('status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      let shopifySyncHealth: HealthStatus['shopifySync'] = 'healthy';
      let queueBacklog = 0;
      let errorRate = 0;
      let lastSync: Date | null = null;

      if (syncError) {
        shopifySyncHealth = 'down';
      } else if (syncStatus) {
        // Calculate queue backlog (items created in last hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentItems = syncStatus.filter(item => 
          new Date(item.created_at) > oneHourAgo
        );
        
        queueBacklog = recentItems.filter(item => item.status === 'queued').length;
        
        // Calculate error rate
        const totalRecent = recentItems.length;
        const failedRecent = recentItems.filter(item => item.status === 'failed').length;
        errorRate = totalRecent > 0 ? (failedRecent / totalRecent) * 100 : 0;

        // Find last successful sync
        const lastSuccessful = syncStatus.find(item => item.status === 'completed');
        lastSync = lastSuccessful ? new Date(lastSuccessful.created_at) : null;

        // Determine health based on metrics
        if (queueBacklog > 100 || errorRate > 25) {
          shopifySyncHealth = 'degraded';
        }
        if (queueBacklog > 500 || errorRate > 50) {
          shopifySyncHealth = 'down';
        }
      }

      // Simple print services check (could be enhanced)
      const printServicesHealth: HealthStatus['printServices'] = 'healthy';

      const status: HealthStatus = {
        database: databaseHealth,
        shopifySync: shopifySyncHealth,
        printServices: printServicesHealth,
        lastSync,
        queueBacklog,
        errorRate: Math.round(errorRate)
      };

      return status;

    } catch (error) {
      logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)), {}, 'health-monitor');
      
      const failedStatus: HealthStatus = {
        database: 'down',
        shopifySync: 'down', 
        printServices: 'down',
        lastSync: null,
        queueBacklog: 0,
        errorRate: 100
      };
      
      return failedStatus;
    }
  };

  const { data: healthStatus, refetch, isLoading, error } = useQuery<HealthStatus>({
    queryKey: ['systemHealth'],
    queryFn: checkSystemHealth,
    staleTime: 60_000, // Fresh for 1 minute
    refetchInterval: liveMode ? 120_000 : false, // Only poll in live mode (2 min)
    refetchOnWindowFocus: true,
  });

  // Set last health check when data changes
  React.useEffect(() => {
    if (healthStatus || error) {
      setLastHealthCheck(new Date());
    }
  }, [healthStatus, error]);

  // Handle critical alerts when data changes
  React.useEffect(() => {
    if (healthStatus && !isLoading) {
      if (healthStatus.database === 'down') {
        toast.error('Database connection lost', {
          description: 'Please refresh the page or contact IT support'
        });
      }

      if (healthStatus.shopifySync === 'down') {
        toast.error('Shopify sync is down', {
          description: 'Items may not sync properly. Contact administrator.'
        });
      }

      if (healthStatus.queueBacklog > 200) {
        toast.warning(`High sync queue backlog: ${healthStatus.queueBacklog} items`, {
          description: 'Consider processing the queue manually'
        });
      }
    }
  }, [healthStatus, isLoading]);

  return {
    healthStatus: healthStatus || {
      database: 'healthy',
      shopifySync: 'healthy', 
      printServices: 'healthy',
      lastSync: null,
      queueBacklog: 0,
      errorRate: 0
    },
    lastHealthCheck,
    checkSystemHealth: refetch,
    isLoading,
    isHealthy: healthStatus ? 
      (healthStatus.database === 'healthy' && 
       healthStatus.shopifySync === 'healthy' && 
       healthStatus.printServices === 'healthy') : true
  };
}