import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShopifySyncPanel } from "./ShopifySyncPanel";
import ShopifyQueueHealth from "./ShopifyQueueHealth";
import ShopifyQueueSettings from "./ShopifyQueueSettings";
import { DeadLetterDashboard } from "./DeadLetterDashboard";
import { SyncMetricsDashboard } from "./SyncMetricsDashboard";
import { useQuery } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";

export function QueueManagementTabs() {
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch mini stats for tab badges
  const { data: stats } = useQuery({
    queryKey: ['queue-mini-stats', refreshKey],
    queryFn: async () => {
      const { data: queueData } = await supabase
        .from('shopify_sync_queue')
        .select('status');
      
      const { data: deadLetterData } = await supabase
        .from('shopify_dead_letter_queue')
        .select('id')
        .is('resolved_at', null);
      
      const queued = queueData?.filter(i => i.status === 'queued').length || 0;
      const failed = queueData?.filter(i => i.status === 'failed').length || 0;
      const deadLetter = deadLetterData?.length || 0;
      
      return { queued, failed, deadLetter };
    },
    refetchInterval: 10000,
    staleTime: 5000
  });

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview" className="relative">
          Overview
          {stats && stats.queued > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
              {stats.queued}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="metrics">
          Metrics
        </TabsTrigger>
        <TabsTrigger value="health" className="relative">
          Health
          {stats && stats.failed > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
              {stats.failed}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="dead-letter" className="relative">
          Dead Letter
          {stats && stats.deadLetter > 0 && (
            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
              {stats.deadLetter}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <ShopifySyncPanel key={refreshKey} onRefresh={() => setRefreshKey(k => k + 1)} />
      </TabsContent>

      <TabsContent value="metrics">
        <SyncMetricsDashboard />
      </TabsContent>

      <TabsContent value="health">
        <ShopifyQueueHealth key={refreshKey} />
      </TabsContent>

      <TabsContent value="dead-letter">
        <DeadLetterDashboard />
      </TabsContent>

      <TabsContent value="settings">
        <ShopifyQueueSettings />
      </TabsContent>
    </Tabs>
  );
}
