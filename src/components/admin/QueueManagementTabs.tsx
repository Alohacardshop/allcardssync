import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShopifySyncPanel } from "./ShopifySyncPanel";
import ShopifyQueueHealth from "./ShopifyQueueHealth";
import ShopifyQueueSettings from "./ShopifyQueueSettings";
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";

export function QueueManagementTabs() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch mini stats for tab badges
  const { data: stats } = useQuery({
    queryKey: ['queue-mini-stats', refreshKey],
    queryFn: async () => {
      const { data } = await supabase
        .from('shopify_sync_queue')
        .select('status');
      
      const queued = data?.filter(i => i.status === 'queued').length || 0;
      const failed = data?.filter(i => i.status === 'failed').length || 0;
      
      return { queued, failed };
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000
  });

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview" className="relative">
          Overview
          {stats && stats.queued > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
              {stats.queued}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="health" className="relative">
          Health Monitor
          {stats && stats.failed > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
              {stats.failed}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      {/* Overview Tab */}
      <TabsContent value="overview">
        <ShopifySyncPanel key={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />
      </TabsContent>

      {/* Health Monitor Tab */}
      <TabsContent value="health">
        <ShopifyQueueHealth key={refreshKey} />
      </TabsContent>

      {/* Settings Tab */}
      <TabsContent value="settings">
        <ShopifyQueueSettings />
      </TabsContent>
    </Tabs>
  );
}
