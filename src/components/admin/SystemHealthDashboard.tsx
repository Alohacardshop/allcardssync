import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock, Activity } from "lucide-react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface HealthData {
  queueHealth: {
    score: number;
    status: 'healthy' | 'warning' | 'critical';
    queued: number;
    processing: number;
    failed: number;
    total: number;
  };
  webhookHealth: {
    registered: number;
    required: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  tcgHealth: {
    connected: boolean;
    status: 'healthy' | 'critical';
  };
  recentErrors: Array<{
    id: string;
    message: string;
    level: string;
    created_at: string;
  }>;
}

async function fetchSystemHealth(): Promise<HealthData> {
  // Fetch queue stats
  const { data: queueItems } = await supabase
    .from('shopify_sync_queue')
    .select('status');

  const queued = queueItems?.filter(i => i.status === 'queued').length || 0;
  const processing = queueItems?.filter(i => i.status === 'processing').length || 0;
  const completed = queueItems?.filter(i => i.status === 'completed').length || 0;
  const failed = queueItems?.filter(i => i.status === 'failed').length || 0;
  const total = queueItems?.length || 0;

  // Calculate queue health score
  const totalProcessed = completed + failed;
  const failureRate = totalProcessed > 0 ? (failed / totalProcessed) * 100 : 0;
  let queueScore = 100;
  if (failureRate > 20) queueScore -= 40;
  else if (failureRate > 10) queueScore -= 20;
  if (queued > 100) queueScore -= 30;
  else if (queued > 50) queueScore -= 15;

  const queueStatus = queueScore >= 80 ? 'healthy' : queueScore >= 60 ? 'warning' : 'critical';

  // Fetch webhook status (simplified check)
  const requiredWebhooks = 2; // Simplified for dashboard
  const { data: webhookCheck } = await supabase.functions.invoke('shopify-webhook-check', {
    body: { storeKey: 'hawaii' }
  });
  const registeredWebhooks = webhookCheck?.webhooks?.length || 0;
  const webhookStatus = registeredWebhooks >= requiredWebhooks ? 'healthy' : 'warning';

  // Check database connectivity (simple ping)
  let tcgConnected = true;
  try {
    const { error: dbError } = await supabase
      .from('system_settings')
      .select('id')
      .limit(1);
    tcgConnected = !dbError;
  } catch (error) {
    tcgConnected = false;
  }

  // Fetch recent errors
  const { data: errors } = await supabase
    .from('system_logs')
    .select('id, message, level, created_at')
    .eq('level', 'error')
    .order('created_at', { ascending: false })
    .limit(3);

  return {
    queueHealth: {
      score: queueScore,
      status: queueStatus,
      queued,
      processing,
      failed,
      total
    },
    webhookHealth: {
      registered: registeredWebhooks,
      required: requiredWebhooks,
      status: webhookStatus
    },
    tcgHealth: {
      connected: tcgConnected,
      status: tcgConnected ? 'healthy' : 'critical'
    },
    recentErrors: (errors || []).map(e => ({
      id: e.id,
      message: e.message,
      level: e.level,
      created_at: e.created_at
    }))
  };
}

export function SystemHealthDashboard() {
  const queryClient = useQueryClient();
  
  const { data: health, isLoading } = useQuery({
    queryKey: ['system-health-dashboard'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    staleTime: 20000
  });

  const getStatusBadge = (status: 'healthy' | 'warning' | 'critical') => {
    if (status === 'healthy') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
    if (status === 'warning') return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><AlertTriangle className="w-3 h-3 mr-1" />Warning</Badge>;
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><XCircle className="w-3 h-3 mr-1" />Critical</Badge>;
  };

  const getStatusDot = (status: 'healthy' | 'warning' | 'critical') => {
    const colors = {
      healthy: 'bg-green-500',
      warning: 'bg-yellow-500',
      critical: 'bg-red-500'
    };
    return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />;
  };

  if (isLoading || !health) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Health Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Health Dashboard
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['system-health-dashboard'] })}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Shopify Sync Status */}
          <Card className={health.queueHealth.status === 'critical' ? 'border-red-200 bg-red-50 dark:bg-red-950' : health.queueHealth.status === 'warning' ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950' : 'border-green-200 bg-green-50 dark:bg-green-950'}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Shopify Sync</span>
                {getStatusDot(health.queueHealth.status)}
              </div>
              {getStatusBadge(health.queueHealth.status)}
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Score: {health.queueHealth.score}/100</div>
                <div>Queued: {health.queueHealth.queued}</div>
                <div>Failed: {health.queueHealth.failed}</div>
              </div>
            </CardContent>
          </Card>

          {/* Queue Health */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Queue Status</span>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{health.queueHealth.total}</div>
              <div className="text-xs text-muted-foreground">
                {health.queueHealth.processing} processing
              </div>
            </CardContent>
          </Card>

          {/* Webhooks */}
          <Card className={health.webhookHealth.status === 'warning' ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950' : ''}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Webhooks</span>
                {getStatusDot(health.webhookHealth.status)}
              </div>
              {getStatusBadge(health.webhookHealth.status)}
              <div className="text-xs text-muted-foreground">
                {health.webhookHealth.registered}/{health.webhookHealth.required} registered
              </div>
            </CardContent>
          </Card>

          {/* TCG Database */}
          <Card className={health.tcgHealth.status === 'critical' ? 'border-red-200 bg-red-50 dark:bg-red-950' : ''}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">TCG Database</span>
                {getStatusDot(health.tcgHealth.status)}
              </div>
              {getStatusBadge(health.tcgHealth.status)}
              <div className="text-xs text-muted-foreground">
                {health.tcgHealth.connected ? 'Connected' : 'Disconnected'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Errors */}
        {health.recentErrors.length > 0 && (
          <Card className="mt-4 border-red-200 bg-red-50 dark:bg-red-950">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
                <AlertTriangle className="w-4 h-4" />
                Recent Errors ({health.recentErrors.length})
              </div>
              <div className="space-y-1">
                {health.recentErrors.map((error) => (
                  <div key={error.id} className="text-xs text-red-700 dark:text-red-300 truncate">
                    • {error.message} ({formatDistanceToNow(new Date(error.created_at), { addSuffix: true })})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
