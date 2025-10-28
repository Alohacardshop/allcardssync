import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function WebhookMonitor() {
  const { data: recentWebhooks, refetch } = useQuery({
    queryKey: ['recent-webhooks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const handleRefresh = () => {
    refetch();
    toast.success('Refreshed webhook events');
  };

  const stats = recentWebhooks ? {
    total: recentWebhooks.length,
    processed: recentWebhooks.filter(w => w.processed_at).length,
    pending: recentWebhooks.filter(w => !w.processed_at).length,
  } : { total: 0, processed: 0, pending: 0 };

  // Group by event_type
  const byEventType = recentWebhooks?.reduce((acc, event) => {
    const type = event.event_type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(event);
    return acc;
  }, {} as Record<string, any[]>) || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Webhook Monitor</h2>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity (Last 50)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Events</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{stats.processed}</div>
            <div className="text-sm text-muted-foreground">Processed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </div>
        </div>
      </Card>

      {/* By Event Type */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Events by Type</h3>
        <div className="space-y-2">
          {Object.entries(byEventType).map(([type, events]) => (
            <div key={type} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{type}</div>
                <div className="text-sm text-muted-foreground">
                  {events.length} events • {events.filter(e => e.processed_at).length} processed
                </div>
              </div>
              <Badge variant={events.filter(e => e.processed_at).length === events.length ? "default" : "secondary"}>
                {events.filter(e => e.processed_at).length}/{events.length}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Events List */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {recentWebhooks?.map((event) => (
            <div key={event.id} className="flex items-start justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {event.processed_at ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="font-medium">{event.event_type}</span>
                  <Badge variant="outline" className="text-xs">{event.webhook_id}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Received: {new Date(event.created_at).toLocaleString()}
                  {event.processed_at && (
                    <> • Processed: {new Date(event.processed_at).toLocaleString()}</>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Setup Instructions */}
      <Card className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Webhook Configuration</h3>
            <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <p><strong>Webhook URL:</strong> {window.location.origin.replace('https://', 'https://dmpoandoydaqxhzdjnmk.supabase.co')}/functions/v1/shopify-webhook</p>
              <p><strong>Required Topics:</strong></p>
              <ul className="list-disc list-inside ml-4">
                <li>inventory_levels/update</li>
                <li>inventory_items/update</li>
                <li>orders/create, orders/updated, orders/fulfilled, orders/cancelled</li>
                <li>refunds/create</li>
                <li>products/update, products/delete</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
