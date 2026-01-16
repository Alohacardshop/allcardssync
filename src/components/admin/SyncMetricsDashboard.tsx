import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Clock, 
  TrendingUp, 
  Zap,
  BarChart3,
  CheckCircle,
  XCircle
} from "lucide-react";
import { format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";

interface SyncMetrics {
  total_processed: number;
  total_failed: number;
  avg_processing_time_ms: number;
  max_processing_time_ms: number;
  items_per_hour: number;
  success_rate: number;
  by_action: Array<{
    action: string;
    total: number;
    completed: number;
    failed: number;
    avg_ms: number;
  }>;
  by_hour: Array<{
    hour: string;
    count: number;
    completed: number;
    failed: number;
  }>;
}

export function SyncMetricsDashboard() {
  // Fetch metrics using the RPC function
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['sync-queue-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sync_queue_metrics', { hours_back: 24 });
      
      if (error) throw error;
      
      // The RPC returns a single row with all metrics
      const row = Array.isArray(data) ? data[0] : data;
      return row as SyncMetrics;
    },
    refetchInterval: 30000
  });

  // Format hourly data for charts
  const hourlyData = metrics?.by_hour?.map(h => ({
    hour: format(new Date(h.hour), 'HH:mm'),
    completed: h.completed,
    failed: h.failed,
    total: h.count
  })).reverse() || [];

  // Format action data for charts
  const actionData = metrics?.by_action?.map(a => ({
    action: a.action,
    completed: a.completed,
    failed: a.failed,
    avgTime: Math.round(a.avg_ms / 1000 * 100) / 100 // Convert to seconds with 2 decimals
  })) || [];

  const formatMs = (ms: number | null) => {
    if (!ms) return '0s';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{metrics?.success_rate || 0}%</p>
              </div>
              <div className="relative h-10 w-10">
                <Progress 
                  value={metrics?.success_rate || 0} 
                  className="h-10 w-10 rounded-full"
                />
                <CheckCircle className="absolute inset-0 m-auto h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Items/Hour</p>
                <p className="text-2xl font-bold">{metrics?.items_per_hour || 0}</p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Time</p>
                <p className="text-2xl font-bold">{formatMs(metrics?.avg_processing_time_ms || 0)}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Max Time</p>
                <p className="text-2xl font-bold">{formatMs(metrics?.max_processing_time_ms || 0)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Processed vs Failed Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Processed (24h)</span>
                  <span className="text-2xl font-bold text-green-600">{metrics?.total_processed || 0}</span>
                </div>
                <Progress value={100} className="h-2 bg-green-100" />
              </div>
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Failed (24h)</span>
                  <span className="text-2xl font-bold text-red-600">{metrics?.total_failed || 0}</span>
                </div>
                <Progress 
                  value={metrics?.total_failed && metrics?.total_processed 
                    ? (metrics.total_failed / (metrics.total_processed + metrics.total_failed)) * 100 
                    : 0} 
                  className="h-2 bg-red-100" 
                />
              </div>
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Processing Trend (24h)
          </CardTitle>
          <CardDescription>
            Items processed per hour
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 bg-muted animate-pulse rounded" />
          ) : hourlyData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="hour" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  stackId="1"
                  stroke="hsl(142, 76%, 36%)"
                  fill="hsl(142, 76%, 36%)"
                  fillOpacity={0.6}
                  name="Completed"
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stackId="1"
                  stroke="hsl(0, 84%, 60%)"
                  fill="hsl(0, 84%, 60%)"
                  fillOpacity={0.6}
                  name="Failed"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* By Action Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance by Action
          </CardTitle>
          <CardDescription>
            Success rate and average processing time per action type
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 bg-muted animate-pulse rounded" />
          ) : actionData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              No data available
            </div>
          ) : (
            <div className="space-y-4">
              {actionData.map((action) => {
                const total = action.completed + action.failed;
                const successRate = total > 0 ? Math.round((action.completed / total) * 100) : 0;
                
                return (
                  <div key={action.action} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {action.action.toUpperCase()}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {total} items
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {action.avgTime}s avg
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          {action.completed}
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          {action.failed}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={successRate} className="flex-1" />
                      <span className="text-sm font-medium w-12 text-right">{successRate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar Chart for Action Comparison */}
      {actionData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Action Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={actionData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="action" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Legend />
                <Bar dataKey="completed" fill="hsl(142, 76%, 36%)" name="Completed" />
                <Bar dataKey="failed" fill="hsl(0, 84%, 60%)" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
