import React, { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Zap,
  RefreshCw, Wrench, ChevronDown, ChevronRight, Filter, Search,
  ShoppingBag, Layers, Ban, Play, RotateCcw, HeartPulse, Timer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  useSyncRuns,
  useSyncRunItems,
  useSyncSummaryStats,
  useRetryFailedItems,
  useRepairLinkage,
  useSyncJobs,
  useSyncJobItems,
  useCancelJob,
  useResumeJob,
  useRetryFailedJobItems,
  useQueueStatusCounts,
  useJobHealthMetrics,
  SyncRun,
  SyncJob,
  SyncJobItem,
  SyncDashboardFilters,
  FAILURE_CODE_LABELS,
} from '@/hooks/useShopifySyncDashboard';

// ── Status Badges ──

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { class: string; label: string }> = {
    completed: { class: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', label: 'Completed' },
    failed: { class: 'bg-red-500/15 text-red-700 border-red-500/30', label: 'Failed' },
    partial_failure: { class: 'bg-amber-500/15 text-amber-700 border-amber-500/30', label: 'Partial' },
    partial: { class: 'bg-amber-500/15 text-amber-700 border-amber-500/30', label: 'Partial' },
    running: { class: 'bg-blue-500/15 text-blue-700 border-blue-500/30 animate-pulse', label: 'Running' },
    queued: { class: 'bg-slate-500/15 text-slate-700 border-slate-500/30', label: 'Queued' },
    cancelled: { class: 'bg-gray-500/15 text-gray-500 border-gray-500/30', label: 'Cancelled' },
  };
  const v = variants[status] || { class: 'bg-muted text-muted-foreground', label: status };
  return <Badge variant="outline" className={v.class}>{v.label}</Badge>;
}

function ResultBadge({ success, error, failureCode }: { success: boolean; error?: string | null; failureCode?: string | null }) {
  if (success) return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Success</Badge>;
  if (failureCode) return <FailureCodeBadge code={failureCode} />;
  if (error?.includes('Duplicate protection')) return <Badge variant="outline" className="bg-orange-500/15 text-orange-700 border-orange-500/30">Blocked</Badge>;
  return <Badge variant="outline" className="bg-red-500/15 text-red-700 border-red-500/30">Failed</Badge>;
}

function FailureCodeBadge({ code }: { code: string }) {
  const variants: Record<string, { class: string; label: string }> = {
    duplicate: { class: 'bg-orange-500/15 text-orange-700 border-orange-500/30', label: 'Duplicate' },
    validation_error: { class: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30', label: 'Validation' },
    rate_limited: { class: 'bg-purple-500/15 text-purple-700 border-purple-500/30', label: 'Rate Limited' },
    shopify_api_error: { class: 'bg-red-500/15 text-red-700 border-red-500/30', label: 'API Error' },
    network_error: { class: 'bg-sky-500/15 text-sky-700 border-sky-500/30', label: 'Network' },
    missing_inventory_data: { class: 'bg-amber-500/15 text-amber-700 border-amber-500/30', label: 'Missing Data' },
    blocked_business_rule: { class: 'bg-orange-500/15 text-orange-700 border-orange-500/30', label: 'Blocked' },
    unknown_error: { class: 'bg-gray-500/15 text-gray-600 border-gray-500/30', label: 'Unknown' },
  };
  const v = variants[code] || { class: 'bg-muted text-muted-foreground', label: code };
  return <Badge variant="outline" className={v.class}>{v.label}</Badge>;
}

function JobItemStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { class: string; label: string }> = {
    queued: { class: 'bg-slate-500/15 text-slate-600 border-slate-500/30', label: 'Queued' },
    running: { class: 'bg-blue-500/15 text-blue-700 border-blue-500/30 animate-pulse', label: 'Running' },
    succeeded: { class: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', label: 'Success' },
    failed: { class: 'bg-red-500/15 text-red-700 border-red-500/30', label: 'Failed' },
    blocked: { class: 'bg-orange-500/15 text-orange-700 border-orange-500/30', label: 'Blocked' },
  };
  const v = variants[status] || { class: 'bg-muted text-muted-foreground', label: status };
  return <Badge variant="outline" className={v.class}>{v.label}</Badge>;
}

// ── Utility ──

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3600_000 * 10) / 10}h`;
}

// ── Summary Cards ──

function SummaryCards({ dateFrom }: { dateFrom: string }) {
  const { data: stats, isLoading } = useSyncSummaryStats(dateFrom);
  const { data: queueCounts } = useQueueStatusCounts();
  const { data: health } = useJobHealthMetrics();

  return (
    <div className="space-y-3">
      {/* Primary stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Synced Today', value: stats?.totalSynced ?? '—', icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Failed Today', value: stats?.totalFailed ?? '—', icon: XCircle, color: 'text-red-600' },
          { label: 'Queued', value: queueCounts?.counts.queued ?? stats?.totalQueued ?? '—', icon: Layers, color: 'text-slate-600' },
          { label: 'Running', value: queueCounts?.counts.running ?? '—', icon: Activity, color: 'text-blue-600' },
          { label: 'Blocked', value: queueCounts?.counts.blocked ?? stats?.totalBlocked ?? '—', icon: AlertTriangle, color: 'text-orange-600' },
          { label: 'Avg Duration', value: stats?.avgDuration ? `${stats.avgDuration}ms` : '—', icon: Zap, color: 'text-purple-600' },
        ].map((c) => (
          <Card key={c.label} className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <c.icon className={cn('h-4 w-4', c.color)} />
              </div>
              <div className="text-2xl font-bold tracking-tight">{isLoading ? '…' : c.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health & Failure Breakdown row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Job Health */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <HeartPulse className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Job Health</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Active Jobs</p>
                <p className="text-lg font-bold">{health?.activeCount ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Oldest Job Age</p>
                <p className="text-lg font-bold">
                  {health?.oldestJobAgeMs ? formatAge(health.oldestJobAgeMs) : '—'}
                </p>
              </div>
            </div>
            {health?.staleJobs && health.staleJobs.length > 0 && (
              <div className="mt-3 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {health.staleJobs.length} stale job{health.staleJobs.length > 1 ? 's' : ''} detected
                </div>
                {health.staleJobs.map(sj => (
                  <p key={sj.id} className="text-[11px] text-amber-600 font-mono">
                    {sj.id.slice(0, 8)}… — last heartbeat {sj.ageSec}s ago
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Failure Breakdown */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Failure Breakdown</span>
            </div>
            {queueCounts?.failureBreakdown && Object.keys(queueCounts.failureBreakdown).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(queueCounts.failureBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, count]) => (
                    <div key={code} className="flex items-center justify-between">
                      <FailureCodeBadge code={code} />
                      <span className="text-sm font-bold tabular-nums">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No failures in queue</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Filters Bar ──

function FiltersBar({
  filters,
  setFilters,
}: {
  filters: SyncDashboardFilters;
  setFilters: React.Dispatch<React.SetStateAction<SyncDashboardFilters>>;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Filters
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                {filters.dateFrom ? format(new Date(filters.dateFrom), 'MMM d') : 'From date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateFrom ? new Date(filters.dateFrom) : undefined}
                onSelect={(d) => setFilters(f => ({ ...f, dateFrom: d ? format(d, 'yyyy-MM-dd') : undefined }))}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                {filters.dateTo ? format(new Date(filters.dateTo), 'MMM d') : 'To date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.dateTo ? new Date(filters.dateTo) : undefined}
                onSelect={(d) => setFilters(f => ({ ...f, dateTo: d ? format(d, 'yyyy-MM-dd') : undefined }))}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => setFilters(f => ({ ...f, status: v === 'all' ? undefined : v }))}
          >
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="partial_failure">Partial</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.queueStatus || 'all'}
            onValueChange={(v) => setFilters(f => ({ ...f, queueStatus: v === 'all' ? undefined : v }))}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Queue status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All queue</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.failureCode || 'all'}
            onValueChange={(v) => setFilters(f => ({ ...f, failureCode: v === 'all' ? undefined : v }))}
          >
            <SelectTrigger className="w-[140px] h-8">
              <SelectValue placeholder="Failure code" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All failures</SelectItem>
              {Object.entries(FAILURE_CODE_LABELS).map(([code, label]) => (
                <SelectItem key={code} value={code}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.storeKey || 'all'}
            onValueChange={(v) => setFilters(f => ({ ...f, storeKey: v === 'all' ? undefined : v }))}
          >
            <SelectTrigger className="w-[130px] h-8">
              <SelectValue placeholder="Store" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stores</SelectItem>
              <SelectItem value="hawaii">Hawaii</SelectItem>
              <SelectItem value="las_vegas">Las Vegas</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Batch ID"
              value={filters.batchId || ''}
              onChange={(e) => setFilters(f => ({ ...f, batchId: e.target.value || undefined }))}
              className="h-8 w-[130px] pl-7 text-sm"
            />
          </div>

          {Object.values(filters).some(Boolean) && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setFilters({})}>
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Job Items Table ──

function JobItemsTable({ jobId }: { jobId: string }) {
  const { data: items, isLoading } = useSyncJobItems(jobId);
  const repairLinkage = useRepairLinkage();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading items…</div>;
  if (!items?.length) return <div className="p-4 text-sm text-muted-foreground">No items</div>;

  // Failure code summary
  const failureCounts: Record<string, number> = {};
  items.forEach(item => {
    if (item.failure_code) {
      failureCounts[item.failure_code] = (failureCounts[item.failure_code] || 0) + 1;
    }
  });
  const hasFailureSummary = Object.keys(failureCounts).length > 0;

  return (
    <div className="border-t border-border/50">
      {hasFailureSummary && (
        <div className="px-4 py-2 bg-muted/20 border-b border-border/30 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Failure breakdown:</span>
          {Object.entries(failureCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
            <span key={code} className="inline-flex items-center gap-1">
              <FailureCodeBadge code={code} />
              <span className="text-xs text-muted-foreground">×{count}</span>
            </span>
          ))}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs">Item ID</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Failure Code</TableHead>
            <TableHead className="text-xs">Attempts</TableHead>
            <TableHead className="text-xs">Next Retry</TableHead>
            <TableHead className="text-xs">Product ID</TableHead>
            <TableHead className="text-xs">API Calls</TableHead>
            <TableHead className="text-xs">Duration</TableHead>
            <TableHead className="text-xs">Error</TableHead>
            <TableHead className="text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={item.status === 'failed' || item.status === 'blocked' ? 'bg-red-500/5' : ''}>
              <TableCell className="font-mono text-xs">{item.item_id.slice(0, 8)}…</TableCell>
              <TableCell><JobItemStatusBadge status={item.status} /></TableCell>
              <TableCell>{item.failure_code ? <FailureCodeBadge code={item.failure_code} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-xs">
                <span>{item.attempt_count}/{item.max_attempts}</span>
              </TableCell>
              <TableCell className="text-xs">
                {item.next_retry_at ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-amber-600 cursor-help">
                          {formatDistanceToNow(new Date(item.next_retry_at), { addSuffix: true })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {format(new Date(item.next_retry_at), 'PPpp')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="font-mono text-xs">{item.shopify_product_id || '—'}</TableCell>
              <TableCell className="text-xs">{item.api_calls}</TableCell>
              <TableCell className="text-xs">{item.duration_ms}ms</TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs max-w-[200px] truncate block text-red-600 cursor-help">
                        {item.last_error || '—'}
                      </span>
                    </TooltipTrigger>
                    {item.last_error && (
                      <TooltipContent side="left" className="max-w-[400px] text-xs">
                        {item.last_error}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell>
                {(item.failure_code === 'duplicate' || item.last_error?.includes('Duplicate protection')) && (
                  <Button
                    size="sm" variant="outline" className="h-6 text-xs gap-1"
                    onClick={() => repairLinkage.mutate({ itemId: item.item_id })}
                    disabled={repairLinkage.isPending}
                  >
                    <Wrench className="h-3 w-3" /> Repair
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Job Row ──

function JobRow({ job }: { job: SyncJob }) {
  const [open, setOpen] = useState(false);
  const cancelJob = useCancelJob();
  const resumeJob = useResumeJob();
  const retryFailed = useRetryFailedJobItems();

  const progress = job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0;
  const isActive = job.status === 'queued' || job.status === 'running';
  const canResume = job.status === 'partial' || job.status === 'failed';
  const hasFailed = job.failed > 0 && !isActive;

  // Heartbeat staleness
  const isStale = job.status === 'running' && job.heartbeat_at &&
    (Date.now() - new Date(job.heartbeat_at).getTime()) > 120_000;

  // Error/cancel summary
  const jobSummary = job.status === 'cancelled'
    ? (job.error || 'Cancelled by user')
    : job.error;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TableRow className={cn(
        "cursor-pointer hover:bg-muted/50",
        isStale && "bg-amber-500/5"
      )} onClick={() => setOpen(!open)}>
        <TableCell>
          <CollapsibleTrigger asChild>
            <span className="inline-flex items-center">
              {open ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
            </span>
          </CollapsibleTrigger>
        </TableCell>
        <TableCell className="text-xs">{format(new Date(job.created_at), 'MMM d, HH:mm:ss')}</TableCell>
        <TableCell className="font-mono text-xs">{job.batch_id}</TableCell>
        <TableCell className="text-xs">{job.store_key}</TableCell>
        <TableCell className="min-w-[120px]">
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <span className="text-[10px] text-muted-foreground">
              {job.processed_items}/{job.total_items} ({progress}%)
            </span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-emerald-600 font-medium">{job.succeeded}</TableCell>
        <TableCell className="text-xs text-red-600 font-medium">{job.failed}</TableCell>
        <TableCell className="text-xs">{job.total_api_calls}</TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <StatusBadge status={job.status} />
            {isStale && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HeartPulse className="h-3.5 w-3.5 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    Stale — last heartbeat {job.heartbeat_at ? formatDistanceToNow(new Date(job.heartbeat_at)) + ' ago' : 'unknown'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs max-w-[150px]">
          {jobSummary && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate block text-muted-foreground cursor-help">{jobSummary}</span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[300px] text-xs">{jobSummary}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {isActive && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); cancelJob.mutate({ jobId: job.id }); }}
                disabled={cancelJob.isPending}
              >
                <Ban className="h-3 w-3" /> Cancel
              </Button>
            )}
            {canResume && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); resumeJob.mutate({ jobId: job.id }); }}
                disabled={resumeJob.isPending}
              >
                <Play className="h-3 w-3" /> Resume
              </Button>
            )}
            {hasFailed && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                onClick={(e) => { e.stopPropagation(); retryFailed.mutate({ jobId: job.id }); }}
                disabled={retryFailed.isPending}
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <tr>
          <td colSpan={12} className="p-0">
            <JobItemsTable jobId={job.id} />
          </td>
        </tr>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Run Items Table (history) ──

function RunItemsTable({ runId }: { runId: string }) {
  const { data: items, isLoading } = useSyncRunItems(runId);
  const repairLinkage = useRepairLinkage();

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading items…</div>;
  if (!items?.length) return <div className="p-4 text-sm text-muted-foreground">No items</div>;

  return (
    <div className="border-t border-border/50">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs">Item ID</TableHead>
            <TableHead className="text-xs">SKU</TableHead>
            <TableHead className="text-xs">Result</TableHead>
            <TableHead className="text-xs">Product ID</TableHead>
            <TableHead className="text-xs">API Calls</TableHead>
            <TableHead className="text-xs">Duration</TableHead>
            <TableHead className="text-xs">Error</TableHead>
            <TableHead className="text-xs">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className={!item.success ? 'bg-red-500/5' : ''}>
              <TableCell className="font-mono text-xs">{item.item_id.slice(0, 8)}…</TableCell>
              <TableCell className="text-xs">{item.sku || '—'}</TableCell>
              <TableCell><ResultBadge success={item.success} error={item.error} /></TableCell>
              <TableCell className="font-mono text-xs">{item.shopify_product_id || '—'}</TableCell>
              <TableCell className="text-xs">{item.api_calls}</TableCell>
              <TableCell className="text-xs">{item.duration_ms}ms</TableCell>
              <TableCell>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs max-w-[200px] truncate block text-red-600 cursor-help">
                        {item.error || '—'}
                      </span>
                    </TooltipTrigger>
                    {item.error && (
                      <TooltipContent side="left" className="max-w-[400px] text-xs">
                        {item.error}
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </TableCell>
              <TableCell>
                {item.error?.includes('Duplicate protection') && (
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                    onClick={() => repairLinkage.mutate({ itemId: item.item_id })}
                    disabled={repairLinkage.isPending}
                  >
                    <Wrench className="h-3 w-3" /> Repair
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Run Row (history) ──

function RunRow({ run }: { run: SyncRun }) {
  const [open, setOpen] = useState(false);
  const retryFailed = useRetryFailedItems();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(!open)}>
        <TableCell>
          <CollapsibleTrigger asChild>
            <span className="inline-flex items-center">
              {open ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
            </span>
          </CollapsibleTrigger>
        </TableCell>
        <TableCell className="text-xs">{format(new Date(run.created_at), 'MMM d, HH:mm:ss')}</TableCell>
        <TableCell className="font-mono text-xs">{run.batch_id}</TableCell>
        <TableCell><Badge variant="outline" className="text-xs">{run.mode}</Badge></TableCell>
        <TableCell className="text-xs">{run.store_key}</TableCell>
        <TableCell className="text-xs">{run.total_items}</TableCell>
        <TableCell className="text-xs text-emerald-600 font-medium">{run.succeeded}</TableCell>
        <TableCell className="text-xs text-red-600 font-medium">{run.failed}</TableCell>
        <TableCell className="text-xs">{run.total_api_calls}</TableCell>
        <TableCell className="text-xs">{run.total_duration_ms}ms</TableCell>
        <TableCell><StatusBadge status={run.status} /></TableCell>
        <TableCell>
          {run.failed > 0 && run.status !== 'running' && (
            <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
              onClick={(e) => { e.stopPropagation(); retryFailed.mutate({ runId: run.id }); }}
              disabled={retryFailed.isPending}
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          )}
        </TableCell>
      </TableRow>
      <CollapsibleContent asChild>
        <tr>
          <td colSpan={12} className="p-0">
            <RunItemsTable runId={run.id} />
          </td>
        </tr>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main Dashboard ──

export default function ShopifySyncDashboard() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [filters, setFilters] = useState<SyncDashboardFilters>({});
  const { data: runs, isLoading: runsLoading } = useSyncRuns(filters);
  const { data: jobs, isLoading: jobsLoading } = useSyncJobs(filters);

  const activeJobs = (jobs || []).filter(j => j.status === 'queued' || j.status === 'running');
  const recentJobs = jobs || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shopify Sync Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitor single-item, bulk, and queued sync activity</p>
          </div>
        </div>
      </div>

      <SummaryCards dateFrom={today + 'T00:00:00Z'} />
      <FiltersBar filters={filters} setFilters={setFilters} />

      <Tabs defaultValue={activeJobs.length > 0 ? 'queue' : 'history'} className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Job Queue
            {activeJobs.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{activeJobs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Run History
          </TabsTrigger>
        </TabsList>

        {/* Queue Tab */}
        <TabsContent value="queue">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sync Job Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Batch</TableHead>
                    <TableHead className="text-xs">Store</TableHead>
                    <TableHead className="text-xs">Progress</TableHead>
                    <TableHead className="text-xs">✓</TableHead>
                    <TableHead className="text-xs">✗</TableHead>
                    <TableHead className="text-xs">API</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Info</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsLoading ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : !recentJobs.length ? (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No queued jobs</TableCell></TableRow>
                  ) : (
                    recentJobs.map((job) => <JobRow key={job.id} job={job} />)
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sync Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Batch</TableHead>
                    <TableHead className="text-xs">Mode</TableHead>
                    <TableHead className="text-xs">Store</TableHead>
                    <TableHead className="text-xs">Total</TableHead>
                    <TableHead className="text-xs">✓</TableHead>
                    <TableHead className="text-xs">✗</TableHead>
                    <TableHead className="text-xs">API</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsLoading ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                  ) : !runs?.length ? (
                    <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No sync runs found</TableCell></TableRow>
                  ) : (
                    runs.map((run) => <RunRow key={run.id} run={run} />)
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
