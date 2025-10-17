// Real-time sync queue monitoring with retry/requeue actions
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, XCircle, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";

interface QueueStats {
  queued: number;
  processing: number;
  done: number;
  error: number;
}

interface SyncJob {
  id: string;
  game: string;
  set_id: string;
  job_type: string;
  status: string;
  last_error: string | null;
  retries: number;
  created_at: string;
}

interface LogEntry {
  id: string;
  level: string;
  message: string;
  source: string | null;
  metadata: any;
  created_at: string;
}

export function SyncMonitor({ game = "pokemon" }: { game?: string }) {
  const queryClient = useQueryClient();

  // Poll queue stats every 4 seconds
  const { data: stats } = useQuery<QueueStats>({
    queryKey: ["queue-stats", game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_queue")
        .select("status")
        .eq("game", game);

      if (error) throw error;

      const stats: QueueStats = {
        queued: 0,
        processing: 0,
        done: 0,
        error: 0,
      };

      data?.forEach((row) => {
        if (row.status === "queued") stats.queued++;
        else if (row.status === "processing") stats.processing++;
        else if (row.status === "done") stats.done++;
        else if (row.status === "error") stats.error++;
      });

      return stats;
    },
    refetchInterval: 4000,
  });

  // Poll recent logs every 5 seconds
  const { data: logs } = useQuery<LogEntry[]>({
    queryKey: ["recent-logs", game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as LogEntry[];
    },
    refetchInterval: 5000,
  });

  // Fetch failed jobs
  const { data: failedJobs } = useQuery<SyncJob[]>({
    queryKey: ["failed-jobs", game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_queue")
        .select("*")
        .eq("game", game)
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  // Retry failed job mutation
  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("sync_queue")
        .update({ status: "queued", retries: 0, last_error: null })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job requeued for retry");
      queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
      queryClient.invalidateQueries({ queryKey: ["failed-jobs"] });
    },
    onError: (error) => {
      toast.error(`Failed to retry: ${error.message}`);
    },
  });

  // Export errors as CSV
  const handleExportErrors = () => {
    if (!failedJobs || failedJobs.length === 0) {
      toast.info("No errors to export");
      return;
    }

    const csv = [
      ["ID", "Game", "Set ID", "Job Type", "Error", "Retries", "Created At"].join(","),
      ...failedJobs.map((job) =>
        [
          job.id,
          job.game,
          job.set_id,
          job.job_type,
          `"${job.last_error?.replace(/"/g, '""') || ""}"`,
          job.retries,
          job.created_at,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sync-errors-${game}-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Errors exported to CSV");
  };

  return (
    <div className="space-y-6">
      {/* Queue Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="text-2xl font-bold">{stats?.queued || 0}</div>
              <div className="text-sm text-muted-foreground">Queued</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
            <div>
              <div className="text-2xl font-bold">{stats?.processing || 0}</div>
              <div className="text-sm text-muted-foreground">Processing</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-bold">{stats?.done || 0}</div>
              <div className="text-sm text-muted-foreground">Done</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-2xl font-bold">{stats?.error || 0}</div>
              <div className="text-sm text-muted-foreground">Error</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Failed Jobs */}
      {failedJobs && failedJobs.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Failed Jobs ({failedJobs.length})
            </h3>
            <Button size="sm" variant="outline" onClick={handleExportErrors}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {failedJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{job.set_id}</div>
                  <div className="text-sm text-muted-foreground">{job.last_error}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Retries: {job.retries} • {new Date(job.created_at).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => retryMutation.mutate(job.id)}
                  disabled={retryMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent Logs */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Recent Logs</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto font-mono text-xs">
          {logs?.map((log) => (
            <div key={log.id} className="flex items-start gap-2 p-2 hover:bg-muted/50 rounded">
              <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "destructive" : "default"}>
                {log.level}
              </Badge>
              <div className="flex-1">
                <div className="font-medium">{log.message}</div>
                <div className="text-muted-foreground text-xs">
                  {new Date(log.created_at).toLocaleTimeString()}
                  {log.source && ` • ${log.source}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
