import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, Wrench, ChevronDown, ChevronRight, AlertCircle, CheckCircle, RefreshCw, Type } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';

interface RepairDiff {
  item_id: string;
  sku: string | null;
  item_type: string;
  current_title: string | null;
  intended_title: string;
  title_changed: boolean;
  description_changed: boolean;
  error?: string;
}

interface RepairResult {
  item_id: string;
  sku: string | null;
  item_type: string;
  status: 'updated' | 'unchanged' | 'failed' | 'skipped';
  changes: string[];
  error?: string;
}

interface Summary {
  total_scanned: number;
  total_needing_repair?: number;
  total_changed?: number;
  total_unchanged: number;
  total_errors?: number;
  total_failed?: number;
  total_skipped?: number;
  total_rate_limited?: number;
  duration_ms: number;
  api_calls: number;
}

interface Pagination {
  has_more: boolean;
  next_cursor: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  graded_card: 'Graded Card',
  raw_card: 'Raw Card',
  graded_comic: 'Graded Comic',
  raw_comic: 'Raw Comic',
};

const TYPE_COLORS: Record<string, string> = {
  graded_card: 'bg-blue-100 text-blue-800',
  raw_card: 'bg-gray-100 text-gray-800',
  graded_comic: 'bg-purple-100 text-purple-800',
  raw_comic: 'bg-green-100 text-green-800',
};

export function TitleRepairPanel() {
  const { assignedStore } = useStore();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'idle' | 'preview' | 'execute'>('idle');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [diffs, setDiffs] = useState<RepairDiff[]>([]);
  const [results, setResults] = useState<RepairResult[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const storeKey = assignedStore || 'hawaii';

  const runRepair = async (runMode: 'preview' | 'execute', resumeCursor?: string | null) => {
    setLoading(true);
    setMode(runMode);
    if (!resumeCursor) {
      setSummary(null);
      setDiffs([]);
      setResults([]);
      setCursor(null);
    }

    try {
      const { data, error } = await supabase.functions.invoke('bulk-title-repair', {
        body: {
          mode: runMode,
          store_key: storeKey,
          limit: 100,
          after_id: resumeCursor || null,
          skip_repaired: true,
          category_filter: categoryFilter === 'all' ? null : categoryFilter,
          type_filter: typeFilter === 'all' ? null : typeFilter,
        }
      });

      if (error) throw error;

      setSummary(prev => {
        if (!prev || !resumeCursor) return data.summary;
        return {
          total_scanned: prev.total_scanned + data.summary.total_scanned,
          total_needing_repair: (prev.total_needing_repair || 0) + (data.summary.total_needing_repair || 0),
          total_changed: (prev.total_changed || 0) + (data.summary.total_changed || 0),
          total_unchanged: prev.total_unchanged + data.summary.total_unchanged,
          total_errors: (prev.total_errors || 0) + (data.summary.total_errors || 0),
          total_failed: (prev.total_failed || 0) + (data.summary.total_failed || 0),
          total_skipped: (prev.total_skipped || 0) + (data.summary.total_skipped || 0),
          total_rate_limited: (prev.total_rate_limited || 0) + (data.summary.total_rate_limited || 0),
          duration_ms: prev.duration_ms + data.summary.duration_ms,
          api_calls: prev.api_calls + data.summary.api_calls,
        };
      });

      setPagination(data.pagination);
      if (data.pagination?.next_cursor) {
        setCursor(data.pagination.next_cursor);
      }

      if (runMode === 'preview') {
        setDiffs(prev => resumeCursor ? [...prev, ...(data.diffs || [])] : data.diffs || []);
        toast.success(`Preview batch: ${data.summary.total_needing_repair} need repair out of ${data.summary.total_scanned} scanned`);
      } else {
        setResults(prev => resumeCursor ? [...prev, ...(data.results || [])] : data.results || []);
        toast.success(`Batch: ${data.summary.total_changed} updated, ${data.summary.total_failed || 0} failed`);
      }
    } catch (err: any) {
      toast.error('Title repair failed', { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const changedDiffs = diffs.filter(d => d.title_changed || d.description_changed);
  const errorDiffs = diffs.filter(d => d.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Type className="h-5 w-5" />
          Bulk Title & Description Repair
        </CardTitle>
        <CardDescription>
          Update Shopify listings to use the unified title/description format across all item types.
          Store: <Badge variant="outline">{storeKey}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Category</label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="tcg">TCG</SelectItem>
                <SelectItem value="comics">Comics</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="graded">Graded</SelectItem>
                <SelectItem value="raw">Raw</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => runRepair('preview')} disabled={loading}>
            {loading && mode === 'preview' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Preview Changes
          </Button>
          <Button
            variant="destructive"
            onClick={() => runRepair('execute')}
            disabled={loading}
          >
            {loading && mode === 'execute' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Execute Repair
          </Button>
          {pagination?.has_more && (
            <Button
              variant="secondary"
              onClick={() => runRepair(mode === 'idle' ? 'preview' : mode as 'preview' | 'execute', cursor)}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Continue Next Batch
            </Button>
          )}
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold">{summary.total_scanned}</div>
              <div className="text-xs text-muted-foreground">Scanned</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-amber-500">
                {summary.total_needing_repair ?? summary.total_changed ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {mode === 'preview' ? 'Need Repair' : 'Updated'}
              </div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{summary.total_unchanged}</div>
              <div className="text-xs text-muted-foreground">Unchanged</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-destructive">
                {(summary.total_errors ?? 0) + (summary.total_failed ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold text-orange-500">{summary.total_rate_limited ?? 0}</div>
              <div className="text-xs text-muted-foreground">Rate Limited</div>
            </div>
          </div>
        )}

        {summary && (
          <div className="text-xs text-muted-foreground">
            Completed in {(summary.duration_ms / 1000).toFixed(1)}s · {summary.api_calls} API calls
            {pagination?.has_more && ' · More items available'}
          </div>
        )}

        {/* Preview Diffs */}
        {diffs.length > 0 && (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {changedDiffs.length > 0 && (
                <div className="text-sm font-medium text-amber-600 mb-1">
                  📝 {changedDiffs.length} items need repair:
                </div>
              )}
              {changedDiffs.map(diff => (
                <Collapsible
                  key={diff.item_id}
                  open={expandedItems.has(diff.item_id)}
                  onOpenChange={() => toggleItem(diff.item_id)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 text-left w-full">
                      {expandedItems.has(diff.item_id) ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="font-mono text-xs shrink-0">{diff.sku || diff.item_id.slice(0, 8)}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[diff.item_type] || 'bg-gray-100'}`}>
                        {TYPE_LABELS[diff.item_type] || diff.item_type}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {diff.title_changed && <Badge variant="secondary" className="text-xs">title</Badge>}
                        {diff.description_changed && <Badge variant="secondary" className="text-xs">description</Badge>}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-6 p-2 text-xs space-y-1 border-l-2 border-muted">
                      {diff.title_changed && (
                        <>
                          <div className="text-destructive line-through">{diff.current_title}</div>
                          <div className="text-green-600">{diff.intended_title}</div>
                        </>
                      )}
                      {!diff.title_changed && (
                        <div className="text-muted-foreground">Title unchanged: {diff.current_title}</div>
                      )}
                      {diff.description_changed && (
                        <div className="text-amber-600">Description will be updated to HTML format</div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}

              {errorDiffs.length > 0 && (
                <>
                  <div className="text-sm font-medium text-destructive mt-3 mb-1">
                    ⚠️ {errorDiffs.length} errors:
                  </div>
                  {errorDiffs.map(diff => (
                    <div key={diff.item_id} className="flex items-center gap-2 p-2 rounded border border-destructive/30 text-xs">
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      <span className="font-mono">{diff.sku || diff.item_id.slice(0, 8)}</span>
                      <span className="text-destructive">{diff.error}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        )}

        {/* Execute Results */}
        {results.length > 0 && (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-1">
              {results.map(r => (
                <div key={r.item_id} className="flex items-center gap-2 p-2 rounded border text-xs">
                  {r.status === 'updated' && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                  {r.status === 'unchanged' && <span className="h-4 w-4 shrink-0 text-center text-muted-foreground">—</span>}
                  {r.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                  {r.status === 'skipped' && <RefreshCw className="h-4 w-4 text-orange-500 shrink-0" />}
                  <span className="font-mono">{r.sku || r.item_id.slice(0, 8)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[r.item_type] || 'bg-gray-100'}`}>
                    {TYPE_LABELS[r.item_type] || r.item_type}
                  </span>
                  {r.changes.length > 0 && (
                    <span className="text-muted-foreground">{r.changes.join(', ')}</span>
                  )}
                  {r.error && <span className="text-destructive">{r.error}</span>}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
