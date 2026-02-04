import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/RefreshButton';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Webhook,
  MapPin,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface SyncRun {
  id: string;
  store_key: string;
  run_type: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  items_checked: number;
  drift_detected: number;
  drift_fixed: number;
  errors: number;
  error_message: string | null;
  metadata: any;
}

interface WebhookStats {
  store_key: string;
  total_events: number;
  last_event_at: string | null;
  dead_letter_count: number;
  topics: string[];
}

interface DriftSummary {
  store_key: string;
  location_gid: string | null;
  drift_count: number;
}

export function SyncHealthDashboard() {
  const [isReconciling, setIsReconciling] = React.useState(false);

  // Fetch latest sync runs
  const { data: syncRuns, isLoading: runsLoading } = useQuery({
    queryKey: ['sync-health-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_health_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as SyncRun[];
    },
    refetchInterval: 30000,
  });

  // Fetch webhook stats from webhook_events table
  const { data: webhookStats } = useQuery({
    queryKey: ['webhook-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, event_type, created_at, dead_letter, status')
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (error) {
        console.error('Failed to fetch webhook events:', error);
        return [];
      }

      // Aggregate stats - single "all stores" bucket since we don't have store_key
      const statsMap = new Map<string, WebhookStats>();
      
      for (const event of data || []) {
        // Extract store from event_type if possible (e.g., "inventory_levels/update")
        const key = 'shopify';
        const existing = statsMap.get(key) || {
          store_key: key,
          total_events: 0,
          last_event_at: null,
          dead_letter_count: 0,
          topics: [],
        };
        
        existing.total_events++;
        if (!existing.last_event_at) {
          existing.last_event_at = event.created_at;
        }
        if (event.dead_letter) {
          existing.dead_letter_count++;
        }
        const topic = event.event_type;
        if (topic && !existing.topics.includes(topic)) {
          existing.topics.push(topic);
        }
        
        statsMap.set(key, existing);
      }

      return Array.from(statsMap.values());
    },
    refetchInterval: 30000,
  });

  // Fetch drift summary
  const { data: driftSummary } = useQuery({
    queryKey: ['drift-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_items')
        .select('store_key, shopify_location_gid')
        .eq('shopify_drift', true)
        .is('deleted_at', null);
      
      if (error) {
        console.error('Failed to fetch drift items:', error);
        return [];
      }

      // Aggregate by store and location
      const summaryMap = new Map<string, DriftSummary>();
      
      for (const item of data || []) {
        const key = `${item.store_key || 'unknown'}_${item.shopify_location_gid || 'unknown'}`;
        const existing = summaryMap.get(key) || {
          store_key: item.store_key || 'unknown',
          location_gid: item.shopify_location_gid,
          drift_count: 0,
        };
        existing.drift_count++;
        summaryMap.set(key, existing);
      }

      return Array.from(summaryMap.values());
    },
    refetchInterval: 30000,
  });

  // Trigger manual reconciliation
  const triggerReconcile = async () => {
    setIsReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-reconcile-inventory');
      
      if (error) throw error;
      
      toast({
        title: 'Reconciliation complete',
        description: `Processed stores: ${Object.keys(data.results || {}).join(', ')}`,
      });
    } catch (error: any) {
      toast({
        title: 'Reconciliation failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="outline" className="text-green-600 border-green-600">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge variant="secondary">Running</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalDrift = driftSummary?.reduce((sum, s) => sum + s.drift_count, 0) || 0;
  const totalDeadLetter = webhookStats?.reduce((sum, s) => sum + s.dead_letter_count, 0) || 0;
  const lastWebhook = webhookStats?.[0]?.last_event_at;
  const lastReconcile = syncRuns?.find(r => r.run_type === 'inventory_reconcile' && r.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Webhook className="h-4 w-4 text-muted-foreground" />
              Last Webhook
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastWebhook ? (
              <>
                <p className="text-2xl font-bold">
                  {formatDistanceToNow(new Date(lastWebhook), { addSuffix: true })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(lastWebhook), 'PPp')}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No webhooks received</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Last Reconcile
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lastReconcile ? (
              <>
                <p className="text-2xl font-bold">
                  {formatDistanceToNow(new Date(lastReconcile.completed_at || lastReconcile.started_at), { addSuffix: true })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lastReconcile.items_checked} items checked
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No reconciliations yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Inventory Drift
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalDrift > 0 ? 'text-destructive' : 'text-green-600'}`}>
              {totalDrift}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              items with drift detected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-muted-foreground" />
              Dead Letter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalDeadLetter > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {totalDeadLetter}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              failed webhook events
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button 
          onClick={triggerReconcile} 
          disabled={isReconciling}
          variant="outline"
        >
          {isReconciling ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Run Reconciliation Now
        </Button>
        <RefreshButton queryKey={['sync-health-runs', 'webhook-stats', 'drift-summary']} />
      </div>

      {/* Drift by Location */}
      {driftSummary && driftSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Drift by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {driftSummary.map((summary, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-md border"
                >
                  <div>
                    <p className="font-medium">{summary.store_key}</p>
                    <p className="text-xs text-muted-foreground">
                      {summary.location_gid?.split('/').pop() || 'Unknown location'}
                    </p>
                  </div>
                  <Badge variant={summary.drift_count > 0 ? "destructive" : "outline"}>
                    {summary.drift_count} items
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Sync Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Sync Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !syncRuns?.length ? (
            <p className="text-muted-foreground text-center py-8">
              No sync runs recorded yet. Run a reconciliation to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {syncRuns.map((run) => (
                <div 
                  key={run.id}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(run.status)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{run.store_key}</span>
                        <Badge variant="secondary" className="text-xs">
                          {run.run_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p><span className="text-muted-foreground">Checked:</span> {run.items_checked}</p>
                      {run.drift_detected > 0 && (
                        <p className="text-destructive">Drift: {run.drift_detected}</p>
                      )}
                      {run.drift_fixed > 0 && (
                        <p className="text-green-600">Fixed: {run.drift_fixed}</p>
                      )}
                      {run.errors > 0 && (
                        <p className="text-orange-600">Errors: {run.errors}</p>
                      )}
                    </div>
                    {getStatusBadge(run.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Activity */}
      {webhookStats && webhookStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Activity by Store
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {webhookStats.map((stats) => (
                <div 
                  key={stats.store_key}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{stats.store_key}</p>
                    <p className="text-xs text-muted-foreground">
                      Last event: {stats.last_event_at 
                        ? formatDistanceToNow(new Date(stats.last_event_at), { addSuffix: true })
                        : 'Never'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {stats.topics.slice(0, 3).map((topic) => (
                        <Badge key={topic} variant="outline" className="text-[10px]">
                          {topic}
                        </Badge>
                      ))}
                      {stats.topics.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{stats.topics.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-semibold">{stats.total_events}</p>
                    <p className="text-xs text-muted-foreground">total events</p>
                    {stats.dead_letter_count > 0 && (
                      <Badge variant="destructive" className="mt-1 text-xs">
                        {stats.dead_letter_count} failed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
