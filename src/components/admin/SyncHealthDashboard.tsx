import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/RefreshButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Webhook,
  MapPin,
  XCircle,
  Store,
  ChevronDown,
  ChevronRight,
  Cloud,
  Database,
  Wifi
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { 
  useReconciliationRuns, 
  useStoreReconciliationSummary,
  useLocationStats 
} from '@/hooks/useReconciliationStats';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { TruthModeBadge } from '@/components/inventory/TruthModeBadge';
import type { InventoryTruthMode } from '@/hooks/useInventoryTruthMode';
import { ShopifyHeartbeatWarning, HeartbeatStatusBadge } from '@/components/admin/ShopifyHeartbeatWarning';

interface WebhookStats {
  store_key: string;
  total_events: number;
  last_event_at: string | null;
  dead_letter_count: number;
  topics: string[];
}

export function SyncHealthDashboard() {
  const [isReconciling, setIsReconciling] = React.useState(false);
  const [isClearingErrors, setIsClearingErrors] = React.useState(false);
  const [expandedStores, setExpandedStores] = React.useState<Set<string>>(new Set());

  // Fetch reconciliation data
  const { data: syncRuns, isLoading: runsLoading } = useReconciliationRuns(20);
  const { data: storeSummaries } = useStoreReconciliationSummary();
  const { data: recentLocationStats } = useLocationStats();

  // Fetch store truth modes
  const { data: storeTruthModes } = useQuery({
    queryKey: ['store-truth-modes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_stores')
        .select('key, name, inventory_truth_mode');
      
      if (error) {
        console.error('Failed to fetch store truth modes:', error);
        return new Map<string, InventoryTruthMode>();
      }
      
      const modeMap = new Map<string, InventoryTruthMode>();
      for (const store of data || []) {
        modeMap.set(store.key, (store.inventory_truth_mode || 'shopify') as InventoryTruthMode);
      }
      return modeMap;
    },
    staleTime: 5 * 60 * 1000,
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

      const statsMap = new Map<string, WebhookStats>();
      
      for (const event of data || []) {
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

  // Fetch sync error count from intake_items
  const { data: syncErrorCount = 0, refetch: refetchErrorCount } = useQuery({
    queryKey: ['sync-error-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('intake_items')
        .select('*', { count: 'exact', head: true })
        .in('shopify_sync_status', ['error', 'failed']);
      
      if (error) {
        console.error('Failed to fetch sync error count:', error);
        return 0;
      }
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Clear recent errors function
  const clearRecentErrors = async () => {
    setIsClearingErrors(true);
    try {
      let clearedCount = 0;

      // Clear dead letter webhook events
      if (totalDeadLetter > 0) {
        const { error: webhookError } = await supabase
          .from('webhook_events')
          .delete()
          .eq('dead_letter', true);
        
        if (webhookError) {
          console.error('Failed to clear dead letter events:', webhookError);
        } else {
          clearedCount += totalDeadLetter;
        }
      }

      // Reset sync errors in intake_items
      if (syncErrorCount > 0) {
        const { error: intakeError } = await supabase
          .from('intake_items')
          .update({
            shopify_sync_status: 'pending',
            last_shopify_sync_error: null,
          })
          .in('shopify_sync_status', ['error', 'failed']);
        
        if (intakeError) {
          console.error('Failed to clear intake sync errors:', intakeError);
        } else {
          clearedCount += syncErrorCount;
        }
      }

      toast({
        title: 'Errors cleared',
        description: `Cleared ${clearedCount} error entries. Items will retry sync automatically.`,
      });

      // Refetch data
      refetchErrorCount();
    } catch (error: any) {
      toast({
        title: 'Failed to clear errors',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsClearingErrors(false);
    }
  };

  // Trigger manual reconciliation
  const triggerReconcile = async () => {
    setIsReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-reconcile-inventory');
      
      if (error) throw error;
      
      toast({
        title: 'Reconciliation complete',
        description: `Processed ${data.stores_processed} stores in ${data.duration_ms}ms`,
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

  const toggleStoreExpanded = (storeKey: string) => {
    setExpandedStores(prev => {
      const next = new Set(prev);
      if (next.has(storeKey)) {
        next.delete(storeKey);
      } else {
        next.add(storeKey);
      }
      return next;
    });
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

  const totalDrift = storeSummaries?.reduce((sum, s) => sum + s.total_drift, 0) || 0;
  const totalDeadLetter = webhookStats?.reduce((sum, s) => sum + s.dead_letter_count, 0) || 0;
  const lastWebhook = webhookStats?.[0]?.last_event_at;
  const lastReconcile = syncRuns?.find(r => r.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Heartbeat Warning - Only shows if stale activity detected */}
      <ShopifyHeartbeatWarning />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Heartbeat Status Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              Shopify Heartbeat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ShopifyHeartbeatWarning compact />
          </CardContent>
        </Card>

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
                  {lastReconcile.items_checked} items • {lastReconcile.metadata?.locations_processed || 0} locations
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
              items with drift across {storeSummaries?.length || 0} stores
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
        
        {(totalDeadLetter > 0 || syncErrorCount > 0) && (
          <Button 
            onClick={clearRecentErrors}
            disabled={isClearingErrors}
            variant="outline"
            className="text-orange-600 border-orange-600 hover:bg-orange-50"
          >
            {isClearingErrors ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Clear Errors ({totalDeadLetter + syncErrorCount})
          </Button>
        )}
        
        <RefreshButton queryKey={['reconciliation-runs', 'store-reconciliation-summary', 'webhook-stats', 'sync-error-count']} />
      </div>

      {/* Tabbed View */}
      <Tabs defaultValue="stores" className="w-full">
        <TabsList>
          <TabsTrigger value="stores" className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            By Store
          </TabsTrigger>
          <TabsTrigger value="runs" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Runs
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        {/* Store View */}
        <TabsContent value="stores" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Reconciliation Status by Store
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!storeSummaries?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  No reconciliation data yet. Run a reconciliation to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {storeSummaries.map((store) => (
                    <Collapsible
                      key={store.store_key}
                      open={expandedStores.has(store.store_key)}
                      onOpenChange={() => toggleStoreExpanded(store.store_key)}
                    >
                      <div className="border rounded-lg">
                        <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {store.last_status && getStatusIcon(store.last_status)}
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold">{store.store_key}</p>
                                {storeTruthModes && (
                                  <TruthModeBadge 
                                    mode={storeTruthModes.get(store.store_key) || 'shopify'} 
                                    showLabel={false}
                                  />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Last run: {store.last_run_at 
                                  ? formatDistanceToNow(new Date(store.last_run_at), { addSuffix: true })
                                  : 'Never'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              {store.total_drift > 0 && (
                                <Badge variant="destructive">
                                  {store.total_drift} drift
                                </Badge>
                              )}
                              {store.total_errors > 0 && (
                                <Badge variant="outline" className="text-orange-600 border-orange-600">
                                  {store.total_errors} errors
                                </Badge>
                              )}
                              {store.total_drift === 0 && store.total_errors === 0 && (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  Healthy
                                </Badge>
                              )}
                            </div>
                            <span className="text-muted-foreground text-sm">
                              {store.locations.length} locations
                            </span>
                            {expandedStores.has(store.store_key) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-t p-4 space-y-2 bg-muted/20">
                            {store.locations.length === 0 ? (
                              <p className="text-muted-foreground text-sm">No location data available</p>
                            ) : (
                              store.locations.map((loc) => (
                                <div 
                                  key={loc.location_gid}
                                  className="flex items-center justify-between p-3 rounded-md bg-background border"
                                >
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <div>
                                      <p className="font-medium text-sm">
                                        {loc.location_name || loc.location_gid.split('/').pop()}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Last checked: {loc.last_checked_at 
                                          ? formatDistanceToNow(new Date(loc.last_checked_at), { addSuffix: true })
                                          : 'Never'} • {loc.last_items_checked} items
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <HeartbeatStatusBadge 
                                      storeKey={store.store_key} 
                                      locationGid={loc.location_gid} 
                                    />
                                    {loc.current_drift_count > 0 ? (
                                      <Badge variant="destructive" className="text-xs">
                                        {loc.current_drift_count} drift
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                        In sync
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Runs View */}
        <TabsContent value="runs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Reconciliation Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !syncRuns?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  No reconciliation runs recorded yet.
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
                            {run.metadata?.locations_processed && (
                              <span className="text-xs text-muted-foreground">
                                ({run.metadata.locations_processed} locations)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
                            {run.metadata?.duration_ms && ` • ${run.metadata.duration_ms}ms`}
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
        </TabsContent>

        {/* Webhooks View */}
        <TabsContent value="webhooks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhook Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!webhookStats?.length ? (
                <p className="text-muted-foreground text-center py-8">
                  No webhook activity recorded.
                </p>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
