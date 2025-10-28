import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityEvent {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
  timestamp: Date;
}

export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    fetchRecentEvents();

    const errorChannel = supabase
      .channel('activity-feed-errors')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'system_logs',
        filter: 'level=eq.error'
      }, (payload) => {
        if (!isPaused && payload.new) {
          addEvent({
            id: crypto.randomUUID(),
            type: 'error',
            message: (payload.new as any).message || 'System error occurred',
            timestamp: new Date()
          });
        }
      }).subscribe();

    return () => { supabase.removeChannel(errorChannel); };
  }, [isPaused]);

  const fetchRecentEvents = async () => {
    const { data: errorData } = await supabase
      .from('system_logs')
      .select('id, message, created_at, level')
      .order('created_at', { ascending: false })
      .limit(10);

    const errorEvents: ActivityEvent[] = (errorData || []).map(e => ({
      id: e.id,
      type: e.level === 'error' ? 'error' : 'info',
      message: e.message,
      timestamp: new Date(e.created_at)
    }));

    setEvents(errorEvents);
  };

  const addEvent = (event: ActivityEvent) => {
    setEvents(prev => [event, ...prev].slice(0, 20));
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 animate-pulse" />
            Recent Activity
          </div>
          <Badge variant="outline" className={cn("cursor-pointer", isPaused ? "bg-warning/10" : "bg-success/10")} onClick={() => setIsPaused(!isPaused)}>
            {isPaused ? 'Paused' : 'Live'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">No recent activity</div>
            ) : (
              events.map((event) => (
                <div key={event.id} className={cn("flex items-start gap-3 p-3 rounded-lg border transition-all hover:bg-muted/50", event.type === 'error' ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/10')}>
                  <div className="flex-shrink-0 mt-0.5">
                    {event.type === 'error' ? <AlertCircle className="w-4 h-4 text-destructive" /> : <CheckCircle className="w-4 h-4 text-success" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(event.timestamp, { addSuffix: true })}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
