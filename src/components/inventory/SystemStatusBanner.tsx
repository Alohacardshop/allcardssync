 import React from 'react';
 import { useQuery } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useNavigate } from 'react-router-dom';
 import { cn } from '@/lib/utils';
 import { Activity, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react';
 import { formatDistanceToNow } from 'date-fns';
 
 interface SystemStatusBannerProps {
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
 
 export function SystemStatusBanner({ storeKey, className }: SystemStatusBannerProps) {
   const navigate = useNavigate();
 
   const { data: status, isLoading } = useQuery({
     queryKey: ['system-status-banner', storeKey],
     queryFn: async (): Promise<SystemStatus> => {
       // Fetch latest webhook event - build query parts separately to avoid deep type inference
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
       
       // Calculate webhook status
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
       
       // Calculate reconcile status
       let reconcileStatus: SystemStatus['reconcile'] = {
         status: 'unknown',
         lastRunAt: null,
         minutesAgo: null,
       };
       
       if (reconcileData?.[0]) {
         const lastRun = new Date(reconcileData[0].completed_at || reconcileData[0].started_at);
         const minutesAgo = Math.floor((now.getTime() - lastRun.getTime()) / 60000);
         // Consider stale if > 2 hours (reconcile runs less frequently)
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
     staleTime: 60_000, // Cache for 1 minute
     refetchInterval: 120_000, // Refresh every 2 minutes
   });
 
   if (isLoading || !status) {
     return null;
   }
 
   const hasIssues = 
     status.webhooks.status === 'delayed' || 
     status.reconcile.status === 'stale' || 
     status.drift.count > 0;
 
   const isCritical = 
     (status.webhooks.status === 'delayed' && (status.webhooks.minutesAgo || 0) > 60) ||
     (status.reconcile.status === 'stale' && (status.reconcile.minutesAgo || 0) > 180);
 
   const getStatusClasses = (s: 'ok' | 'delayed' | 'stale' | 'unknown') => {
     switch (s) {
       case 'ok': return 'text-primary';
       case 'delayed':
       case 'stale': return 'text-accent-foreground';
       default: return 'text-muted-foreground';
     }
   };
 
   const formatAge = (date: Date | null) => {
     if (!date) return 'never';
     return formatDistanceToNow(date, { addSuffix: false });
   };
 
   return (
     <button
       onClick={() => navigate('/admin/sync-health')}
       className={cn(
         'group flex items-center gap-4 px-3 py-1.5 rounded-md text-xs transition-colors',
         'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
         isCritical 
           ? 'bg-destructive/10 border border-destructive/20' 
           : hasIssues 
             ? 'bg-accent/50 border border-accent'
             : 'bg-muted/30 border border-border/50',
         className
       )}
     >
       {/* Webhooks */}
       <div className="flex items-center gap-1.5">
         <Activity className={cn('h-3 w-3', getStatusClasses(status.webhooks.status))} />
         <span className="text-muted-foreground">Webhooks:</span>
         <span className={cn('font-medium', getStatusClasses(status.webhooks.status))}>
           {status.webhooks.status === 'ok' ? 'OK' : 
            status.webhooks.status === 'delayed' ? `Delayed (${formatAge(status.webhooks.lastEventAt)})` : 
            'Unknown'}
         </span>
       </div>
 
       <span className="text-border">|</span>
 
       {/* Reconcile */}
       <div className="flex items-center gap-1.5">
         <RefreshCw className={cn('h-3 w-3', getStatusClasses(status.reconcile.status))} />
         <span className="text-muted-foreground">Reconcile:</span>
         <span className={cn('font-medium', getStatusClasses(status.reconcile.status))}>
           {status.reconcile.status === 'ok' ? 'OK' : 
            status.reconcile.status === 'stale' ? `Stale (${formatAge(status.reconcile.lastRunAt)})` : 
            'Unknown'}
         </span>
       </div>
 
       <span className="text-border">|</span>
 
       {/* Drift */}
       <div className="flex items-center gap-1.5">
         <AlertTriangle className={cn('h-3 w-3', status.drift.count > 0 ? 'text-accent-foreground' : 'text-primary')} />
         <span className="text-muted-foreground">Drift:</span>
         <span className={cn('font-medium', status.drift.count > 0 ? 'text-accent-foreground' : 'text-primary')}>
           {status.drift.count}
         </span>
       </div>
 
       {/* Arrow indicator */}
       <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
     </button>
   );
 }