import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Package, Clock, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

interface MetricCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  loading?: boolean;
}

function MetricCard({ icon: Icon, label, value, subtitle, loading }: MetricCardProps) {
  if (loading) {
    return (
      <Card className="p-4 flex items-center gap-4">
        <Skeleton className="w-10 h-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 flex items-center gap-4 hover:shadow-hover transition-shadow">
      <div className="p-2 rounded-full bg-primary/10">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Card>
  );
}

export function MetricsBar() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async () => {
      // Use RPC function for reliable counts
      const { data: countData, error: countError } = await supabase.rpc('get_table_counts' as any);
      
      // Get last sync
      const { data: syncData } = await supabase
        .from('shopify_sync_queue')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback to hardcoded values if RPC fails
      return {
        totalItems: (countData as any)?.inventory_count || 0,
        queueCount: (countData as any)?.queue_count || 0,
        lastSync: syncData?.created_at || null
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <MetricCard
        icon={Package}
        label="Total Inventory"
        value={metrics?.totalItems.toLocaleString() || '0'}
        loading={isLoading}
      />
      <MetricCard
        icon={RefreshCw}
        label="Queue Status"
        value={metrics?.queueCount || 0}
        subtitle={metrics?.queueCount ? 'items pending' : 'all clear'}
        loading={isLoading}
      />
      <MetricCard
        icon={Clock}
        label="Last Sync"
        value={metrics?.lastSync ? formatDistanceToNow(new Date(metrics.lastSync), { addSuffix: true }) : 'Never'}
        loading={isLoading}
      />
    </div>
  );
}
