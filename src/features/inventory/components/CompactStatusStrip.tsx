import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Activity, RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface CompactStatusStripProps {
  storeKey?: string;
  className?: string;
}

interface SystemStatus {
  webhooks: {
    status: 'ok' | 'delayed' | 'unknown';
    lastEventAt: Date | null;
    minutesAgo: number | null;
  };
  reconcile: {
    status: 'ok' | 'stale' | 'unknown';
    lastRunAt: Date | null;
    minutesAgo: number | null;
  };
  drift: {
    count: number;
  };
}

export function CompactStatusStrip({ storeKey, className }: CompactStatusStripProps) {
  const navigate = useNavigate();
  const isWide = useMediaQuery('(min-width: 1280px)');

  const { data: status, isLoading } = useQuery({
    queryKey: ['compact-status-strip', storeKey],
    queryFn: async (): Promise<SystemStatus> => {
      // Fetch latest webhook event
      const webhookResult = await supabase
        .from('webhook_events')
        .select('created_at')
        .order('created_at', { ascending: false });
      const webhookData = webhookResult.data;
      
      // Fetch latest reconciliation run  
      const reconcileResult = await supabase
        .from('sync_health_runs')
        .select('completed_at, started_at')
        .eq('run_type', 'inventory_reconcile')
        .order('started_at', { ascending: false })
        .limit(1);
      const reconcileData = reconcileResult.data;
      
      // Fetch drift count
      const driftResult = await supabase
        .from('intake_items')
        .select('id', { count: 'exact', head: true })
        .eq('shopify_drift', true)
        .is('deleted_at', null);
      const driftCount = driftResult.count;
      
      const now = new Date();
      
      let webhookStatus: SystemStatus['webhooks'] = {
        status: 'unknown',
        lastEventAt: null,
        minutesAgo: null,
      };
      
      if (webhookData?.[0]?.created_at) {
        const lastEvent = new Date(webhookData[0].created_at);
        const minutesAgo = Math.floor((now.getTime() - lastEvent.getTime()) / 60000);
        webhookStatus = {
          status: minutesAgo > 60 ? 'delayed' : 'ok',
          lastEventAt: lastEvent,
          minutesAgo,
        };
      }
      
      let reconcileStatus: SystemStatus['reconcile'] = {
        status: 'unknown',
        lastRunAt: null,
        minutesAgo: null,
      };
      
      if (reconcileData?.[0]) {
        const lastRun = new Date(reconcileData[0].completed_at || reconcileData[0].started_at);
        const minutesAgo = Math.floor((now.getTime() - lastRun.getTime()) / 60000);
        reconcileStatus = {
          status: minutesAgo > 120 ? 'stale' : 'ok',
          lastRunAt: lastRun,
          minutesAgo,
        };
      }
      
      return {
        webhooks: webhookStatus,
        reconcile: reconcileStatus,
        drift: { count: driftCount || 0 },
      };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isLoading || !status) {
    return null;
  }

  const hasIssues = 
    status.webhooks.status === 'delayed' || 
    status.reconcile.status === 'stale' || 
    status.drift.count > 0;

  const getStatusColor = (s: 'ok' | 'delayed' | 'stale' | 'unknown') => {
    switch (s) {
      case 'ok': return 'text-primary';
      case 'delayed':
      case 'stale': return 'text-accent-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getDotColor = (s: 'ok' | 'delayed' | 'stale' | 'unknown') => {
    switch (s) {
      case 'ok': return 'bg-primary';
      case 'delayed':
      case 'stale': return 'bg-accent';
      default: return 'bg-muted-foreground';
    }
  };

  // On wide screens, show inline status indicators
  if (isWide) {
    return (
      <div className={cn('flex items-center gap-3 text-xs', className)}>
        {/* Webhooks */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              onClick={() => navigate('/admin/sync-health')}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', getDotColor(status.webhooks.status))} />
              <span className="text-muted-foreground">Webhooks</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {status.webhooks.status === 'ok' ? 'Webhooks OK' : 
             status.webhooks.status === 'delayed' ? `Last event ${status.webhooks.minutesAgo}m ago` : 
             'Unknown status'}
          </TooltipContent>
        </Tooltip>

        {/* Reconcile */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              onClick={() => navigate('/admin/sync-health')}
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', getDotColor(status.reconcile.status))} />
              <span className="text-muted-foreground">Reconcile</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {status.reconcile.status === 'ok' ? 'Reconciliation OK' : 
             status.reconcile.status === 'stale' ? `Last run ${status.reconcile.minutesAgo}m ago` : 
             'Unknown status'}
          </TooltipContent>
        </Tooltip>

        {/* Drift */}
        {status.drift.count > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button 
                onClick={() => navigate('/admin/sync-health')}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <AlertTriangle className="h-3 w-3 text-accent-foreground" />
                <span className="text-accent-foreground font-medium">{status.drift.count} drift</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {status.drift.count} items have inventory drift
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // On narrower screens, collapse to dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            'h-7 px-2 text-xs gap-1',
            hasIssues && 'text-accent-foreground'
          )}
        >
          {hasIssues ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Activity className="h-3 w-3" />
          )}
          <span>Status</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => navigate('/admin/sync-health')}>
          <span className={cn('h-1.5 w-1.5 rounded-full mr-2', getDotColor(status.webhooks.status))} />
          Webhooks: {status.webhooks.status === 'ok' ? 'OK' : status.webhooks.status}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/admin/sync-health')}>
          <span className={cn('h-1.5 w-1.5 rounded-full mr-2', getDotColor(status.reconcile.status))} />
          Reconcile: {status.reconcile.status === 'ok' ? 'OK' : status.reconcile.status}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/admin/sync-health')}>
          <AlertTriangle className={cn('h-3 w-3 mr-2', status.drift.count > 0 ? 'text-accent-foreground' : 'text-muted-foreground')} />
          Drift: {status.drift.count}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
