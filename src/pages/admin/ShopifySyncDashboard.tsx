import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Zap,
  RefreshCw, Wrench, ChevronDown, ChevronRight, Filter, Search,
  ShoppingBag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import {
  useSyncRuns,
  useSyncRunItems,
  useSyncSummaryStats,
  useRetryFailedItems,
  useRepairLinkage,
  SyncRun,
  SyncRunItem,
  SyncDashboardFilters,
} from '@/hooks/useShopifySyncDashboard';

// ── Status Badge ──
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { class: string; label: string }> = {
    completed: { class: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', label: 'Completed' },
    failed: { class: 'bg-red-500/15 text-red-700 border-red-500/30', label: 'Failed' },
    partial_failure: { class: 'bg-amber-500/15 text-amber-700 border-amber-500/30', label: 'Partial' },
    running: { class: 'bg-blue-500/15 text-blue-700 border-blue-500/30', label: 'Running' },
  };
  const v = variants[status] || { class: 'bg-muted text-muted-foreground', label: status };
  return <Badge variant="outline" className={v.class}>{v.label}</Badge>;
}

function ResultBadge({ success, error }: { success: boolean; error?: string | null }) {
  if (success) {
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Success</Badge>;
  }
  if (error?.includes('Duplicate protection')) {
    return <Badge variant="outline" className="bg-orange-500/15 text-orange-700 border-orange-500/30">Blocked</Badge>;
  }
  return <Badge variant="outline" className="bg-red-500/15 text-red-700 border-red-500/30">Failed</Badge>;
}

// ── Summary Cards ──
function SummaryCards({ dateFrom }: { dateFrom: string }) {
  const { data: stats, isLoading } = useSyncSummaryStats(dateFrom);

  const cards = [
    { label: 'Synced Today', value: stats?.totalSynced ?? '—', icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Failed Today', value: stats?.totalFailed ?? '—', icon: XCircle, color: 'text-red-600' },
    { label: 'Running', value: stats?.totalRetrying ?? '—', icon: Clock, color: 'text-blue-600' },
    { label: 'Blocked (Dup)', value: stats?.totalBlocked ?? '—', icon: AlertTriangle, color: 'text-orange-600' },
    { label: 'Avg API Calls', value: stats?.avgApiCalls ?? '—', icon: Zap, color: 'text-purple-600' },
    { label: 'Avg Duration', value: stats?.avgDuration ? `${stats.avgDuration}ms` : '—', icon: Activity, color: 'text-indigo-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
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
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setFilters({})}
            >
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Run Items Table ──
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
              <TableCell className="text-xs max-w-[200px] truncate text-red-600">{item.error || '—'}</TableCell>
              <TableCell>
                {item.error?.includes('Duplicate protection') && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs gap-1"
                    onClick={() => repairLinkage.mutate({ itemId: item.item_id })}
                    disabled={repairLinkage.isPending}
                  >
                    <Wrench className="h-3 w-3" />
                    Repair
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

// ── Expandable Run Row ──
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
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {run.mode}
          </Badge>
        </TableCell>
        <TableCell className="text-xs">{run.store_key}</TableCell>
        <TableCell className="text-xs">{run.total_items}</TableCell>
        <TableCell className="text-xs text-emerald-600 font-medium">{run.succeeded}</TableCell>
        <TableCell className="text-xs text-red-600 font-medium">{run.failed}</TableCell>
        <TableCell className="text-xs">{run.total_api_calls}</TableCell>
        <TableCell className="text-xs">{run.total_duration_ms}ms</TableCell>
        <TableCell><StatusBadge status={run.status} /></TableCell>
        <TableCell>
          {run.failed > 0 && run.status !== 'running' && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                retryFailed.mutate({ runId: run.id });
              }}
              disabled={retryFailed.isPending}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
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
  const { data: runs, isLoading } = useSyncRuns(filters);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shopify Sync Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitor single-item and bulk sync activity</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards dateFrom={today + 'T00:00:00Z'} />

      {/* Filters */}
      <FiltersBar filters={filters} setFilters={setFilters} />

      {/* Runs Table */}
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
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : !runs?.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No sync runs found</TableCell>
                </TableRow>
              ) : (
                runs.map((run) => <RunRow key={run.id} run={run} />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
