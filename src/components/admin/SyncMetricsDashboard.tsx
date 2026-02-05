import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  Clock, 
  TrendingUp, 
  Zap,
  CheckCircle,
  XCircle
} from "lucide-react";

interface SyncMetrics {
   total_items: number;
   pending_count: number;
   processing_count: number;
   completed_count: number;
   failed_count: number;
  avg_processing_time_ms: number;
  success_rate: number;
   items_per_hour: number;
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
                 <p className="text-2xl font-bold">{formatMs(metrics?.avg_processing_time_ms || 0)}</p>
              </div>
               <TrendingUp className="h-8 w-8 text-blue-500" />
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
                   <span className="text-2xl font-bold text-green-600">{metrics?.completed_count || 0}</span>
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
                   <span className="text-2xl font-bold text-red-600">{metrics?.failed_count || 0}</span>
                </div>
                <Progress 
                   value={metrics?.failed_count && metrics?.completed_count 
                     ? (metrics.failed_count / (metrics.completed_count + metrics.failed_count)) * 100 
                    : 0} 
                  className="h-2 bg-red-100" 
                />
              </div>
              <XCircle className="h-10 w-10 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

       {/* Pending/Processing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
             Queue Status
          </CardTitle>
          <CardDescription>
             Current sync queue status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 bg-muted animate-pulse rounded" />
           ) : (
             <div className="grid grid-cols-2 gap-4">
               <div className="p-4 border rounded-lg text-center">
                 <p className="text-3xl font-bold text-blue-600">{metrics?.pending_count || 0}</p>
                 <p className="text-sm text-muted-foreground">Pending</p>
               </div>
               <div className="p-4 border rounded-lg text-center">
                 <p className="text-3xl font-bold text-yellow-600">{metrics?.processing_count || 0}</p>
                 <p className="text-sm text-muted-foreground">Processing</p>
               </div>
               <div className="p-4 border rounded-lg text-center">
                 <p className="text-3xl font-bold text-green-600">{metrics?.completed_count || 0}</p>
                 <p className="text-sm text-muted-foreground">Completed</p>
               </div>
               <div className="p-4 border rounded-lg text-center">
                 <p className="text-3xl font-bold text-red-600">{metrics?.failed_count || 0}</p>
                 <p className="text-sm text-muted-foreground">Failed</p>
               </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
