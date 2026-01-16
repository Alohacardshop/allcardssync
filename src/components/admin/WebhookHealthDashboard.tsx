import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  TrendingDown, 
  TrendingUp,
  XCircle,
  Bell,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Progress } from '@/components/ui/progress';

interface WebhookHealthStats {
  total_count: number;
  processed_count: number;
  failed_count: number;
  pending_count: number;
  success_rate: number | null;
  last_24h_total: number;
  last_24h_failed: number;
  avg_processing_time_seconds: number | null;
}

interface FailedWebhook {
  id: string;
  event_type: string | null;
  webhook_id: string | null;
  error_message: string | null;
  created_at: string;
  retry_count: number | null;
}

export function WebhookHealthDashboard() {
  // Fetch health stats
  const { data: healthStats, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['webhook-health-stats'],
    queryFn: async (): Promise<WebhookHealthStats | null> => {
      const { data, error } = await supabase.rpc('get_webhook_health_stats');
      if (error) {
        console.error('Error fetching webhook health stats:', error);
        return null;
      }
      return data?.[0] || null;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch recent failures
  const { data: recentFailures, isLoading: loadingFailures, refetch: refetchFailures } = useQuery({
    queryKey: ['webhook-recent-failures'],
    queryFn: async (): Promise<FailedWebhook[]> => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, event_type, webhook_id, error_message, created_at, retry_count')
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch HMAC failures from logs
  const { data: hmacFailures } = useQuery({
    queryKey: ['webhook-hmac-failures'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .eq('message', 'Shopify webhook HMAC validation failed')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const handleRefresh = () => {
    refetchStats();
    refetchFailures();
    toast.success('Dashboard refreshed');
  };

  const getHealthStatus = () => {
    if (!healthStats) return 'unknown';
    if (healthStats.success_rate === null) return 'no-data';
    if (healthStats.success_rate >= 95) return 'healthy';
    if (healthStats.success_rate >= 80) return 'degraded';
    return 'critical';
  };

  const healthStatus = getHealthStatus();

  const getStatusBadge = () => {
    switch (healthStatus) {
      case 'healthy':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Healthy
          </Badge>
        );
      case 'degraded':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Degraded
          </Badge>
        );
      case 'critical':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Critical
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            No Data
          </Badge>
        );
    }
  };

  if (loadingStats) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading webhook health data...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Health Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              <CardTitle>Webhook Health Dashboard</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
          <CardDescription>
            Monitor webhook processing health and failures (last 7 days)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{healthStats?.total_count || 0}</div>
              <div className="text-sm text-muted-foreground">Total Webhooks</div>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{healthStats?.processed_count || 0}</div>
              <div className="text-sm text-muted-foreground">Processed</div>
            </div>
            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{healthStats?.failed_count || 0}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{healthStats?.pending_count || 0}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
          </div>

          {/* Success Rate Progress */}
          {healthStats?.success_rate !== null && (
            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Success Rate</span>
                <span className="text-sm text-muted-foreground">
                  {healthStats?.success_rate?.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={healthStats?.success_rate || 0} 
                className={`h-2 ${
                  (healthStats?.success_rate || 0) >= 95 
                    ? '[&>div]:bg-green-500' 
                    : (healthStats?.success_rate || 0) >= 80 
                      ? '[&>div]:bg-yellow-500' 
                      : '[&>div]:bg-red-500'
                }`}
              />
            </div>
          )}

          {/* 24h Stats */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{healthStats?.last_24h_total || 0}</div>
                <div className="text-xs text-muted-foreground">Last 24h Total</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <div>
                <div className="font-medium text-red-600">{healthStats?.last_24h_failed || 0}</div>
                <div className="text-xs text-muted-foreground">Last 24h Failed</div>
              </div>
            </div>
          </div>

          {/* Avg Processing Time */}
          {healthStats?.avg_processing_time_seconds !== null && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Average processing time: {healthStats?.avg_processing_time_seconds?.toFixed(2)}s
            </div>
          )}
        </CardContent>
      </Card>

      {/* HMAC Failures Alert */}
      {hmacFailures && hmacFailures.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-500" />
              <CardTitle className="text-red-700 dark:text-red-400">HMAC Validation Failures</CardTitle>
            </div>
            <CardDescription>
              Recent webhook signature validation failures - check your webhook secrets!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {hmacFailures.map((failure: any) => (
                <div 
                  key={failure.id} 
                  className="flex items-start justify-between p-3 bg-red-50 dark:bg-red-950 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium text-red-700 dark:text-red-300">
                      {failure.context?.topic || 'Unknown topic'}
                    </div>
                    <div className="text-sm text-red-600 dark:text-red-400">
                      Domain: {failure.context?.domain || 'Unknown'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(failure.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <Badge variant="destructive">HMAC Failed</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Failures */}
      {recentFailures && recentFailures.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <CardTitle>Recent Failed Webhooks</CardTitle>
            </div>
            <CardDescription>
              Webhooks that failed to process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentFailures.map((failure) => (
                <div 
                  key={failure.id} 
                  className="flex items-start justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{failure.event_type || 'Unknown'}</span>
                      <Badge variant="outline" className="text-xs">{failure.webhook_id || 'N/A'}</Badge>
                    </div>
                    {failure.error_message && (
                      <div className="text-sm text-red-600 dark:text-red-400 mt-1">
                        {failure.error_message}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(failure.created_at), { addSuffix: true })}
                      {(failure.retry_count || 0) > 0 && ` • ${failure.retry_count} retries`}
                    </div>
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
