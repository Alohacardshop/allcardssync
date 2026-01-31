import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  Play,
  RotateCcw,
  Skull,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

type RetryJobStatus = "queued" | "running" | "done" | "dead";
type RetryJobType = "END_EBAY" | "SET_SHOPIFY_LEVEL" | "ENFORCE_LOCATION" | "SET_SHOPIFY_ZERO";

interface RetryJob {
  id: string;
  job_type: RetryJobType;
  sku: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  status: RetryJobStatus;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<RetryJobStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  queued: { label: "Queued", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  running: { label: "Running", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  done: { label: "Done", variant: "outline", icon: <CheckCircle className="h-3 w-3" /> },
  dead: { label: "Dead", variant: "destructive", icon: <Skull className="h-3 w-3" /> },
};

const jobTypeLabels: Record<RetryJobType, string> = {
  END_EBAY: "End eBay Listing",
  SET_SHOPIFY_LEVEL: "Set Shopify Level",
  SET_SHOPIFY_ZERO: "Zero Shopify Inventory",
  ENFORCE_LOCATION: "Enforce Location",
};

export function RetryJobsMonitor() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"pending" | "dead" | "completed">("pending");

  const { data: pendingJobs = [], isLoading: loadingPending, refetch: refetchPending } = useQuery({
    queryKey: ["retry-jobs", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retry_jobs")
        .select("*")
        .in("status", ["queued", "running"])
        .order("next_run_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return data as RetryJob[];
    },
    refetchInterval: 10000,
  });

  const { data: deadJobs = [], isLoading: loadingDead, refetch: refetchDead } = useQuery({
    queryKey: ["retry-jobs", "dead"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retry_jobs")
        .select("*")
        .eq("status", "dead")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as RetryJob[];
    },
    enabled: activeTab === "dead",
  });

  const { data: completedJobs = [], isLoading: loadingCompleted, refetch: refetchCompleted } = useQuery({
    queryKey: ["retry-jobs", "completed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("retry_jobs")
        .select("*")
        .eq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as RetryJob[];
    },
    enabled: activeTab === "completed",
  });

  const triggerProcessorMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-retry-jobs");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Processed ${data?.processed || 0} jobs`);
      queryClient.invalidateQueries({ queryKey: ["retry-jobs"] });
    },
    onError: (error) => {
      toast.error(`Failed to run processor: ${error.message}`);
    },
  });

  const requeueMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("retry_jobs")
        .update({
          status: "queued",
          attempts: 0,
          next_run_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Job requeued");
      queryClient.invalidateQueries({ queryKey: ["retry-jobs"] });
    },
    onError: (error) => {
      toast.error(`Failed to requeue: ${error.message}`);
    },
  });

  const renderJobTable = (jobs: RetryJob[], isLoading: boolean, showRequeue = false) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (jobs.length === 0) {
      return (
        <div className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">No jobs in this category</p>
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Job Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Next Run / Updated</TableHead>
            <TableHead>Last Error</TableHead>
            {showRequeue && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const config = statusConfig[job.status];
            return (
              <TableRow key={job.id}>
                <TableCell className="font-mono font-medium">{job.sku}</TableCell>
                <TableCell>
                  <Badge variant="outline">{jobTypeLabels[job.job_type] || job.job_type}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
                    {config.icon}
                    {config.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={job.attempts >= job.max_attempts ? "text-destructive font-medium" : ""}>
                    {job.attempts} / {job.max_attempts}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {job.status === "queued" || job.status === "running"
                    ? formatDistanceToNow(new Date(job.next_run_at), { addSuffix: true })
                    : format(new Date(job.updated_at), "MMM d, HH:mm")}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {job.last_error ? (
                    <span className="text-xs text-destructive truncate block" title={job.last_error}>
                      {job.last_error.slice(0, 50)}...
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showRequeue && (
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => requeueMutation.mutate(job.id)}
                      disabled={requeueMutation.isPending}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Requeue
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Retry Jobs Queue
          </CardTitle>
          <CardDescription>Monitor and manage failed sync operations</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={pendingJobs.length > 0 ? "secondary" : "outline"}>
            {pendingJobs.length} pending
          </Badge>
          {deadJobs.length > 0 && (
            <Badge variant="destructive">{deadJobs.length} dead</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerProcessorMutation.mutate()}
            disabled={triggerProcessorMutation.isPending}
          >
            {triggerProcessorMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            Run Processor
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="pending" className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Pending ({pendingJobs.length})
            </TabsTrigger>
            <TabsTrigger value="dead" className="flex items-center gap-1">
              <Skull className="h-4 w-4" />
              Dead ({deadJobs.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Completed
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {renderJobTable(pendingJobs, loadingPending)}
          </TabsContent>

          <TabsContent value="dead" className="mt-4">
            {renderJobTable(deadJobs, loadingDead, true)}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {renderJobTable(completedJobs, loadingCompleted)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
