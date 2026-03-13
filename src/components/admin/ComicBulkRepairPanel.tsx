import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BookOpen, Eye, Wrench, ChevronDown, ChevronRight, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';

interface RepairDiff {
  item_id: string;
  sku: string | null;
  current_title: string | null;
  intended_title: string;
  title_changed: boolean;
  description_changed: boolean;
  image_changed: boolean;
  metafields_changed: number;
  error?: string;
}

interface RepairResult {
  item_id: string;
  sku: string | null;
  status: 'updated' | 'unchanged' | 'failed';
  changes: string[];
  error?: string;
}

interface Summary {
  total_scanned: number;
  total_comics: number;
  total_needing_repair?: number;
  total_changed?: number;
  total_unchanged: number;
  total_errors?: number;
  total_failed?: number;
  duration_ms: number;
  api_calls: number;
}

export function ComicBulkRepairPanel() {
  const { assignedStore } = useStore();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'idle' | 'preview' | 'execute'>('idle');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [diffs, setDiffs] = useState<RepairDiff[]>([]);
  const [results, setResults] = useState<RepairResult[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const storeKey = assignedStore || 'hawaii';

  const runRepair = async (runMode: 'preview' | 'execute') => {
    setLoading(true);
    setMode(runMode);
    setSummary(null);
    setDiffs([]);
    setResults([]);

    try {
      const { data, error } = await supabase.functions.invoke('bulk-comic-repair', {
        body: { mode: runMode, store_key: storeKey }
      });

      if (error) throw error;

      setSummary(data.summary);

      if (runMode === 'preview') {
        setDiffs(data.diffs || []);
        toast.success(`Preview complete: ${data.summary.total_needing_repair} comics need repair`);
      } else {
        setResults(data.results || []);
        toast.success(`Repair complete: ${data.summary.total_changed} updated, ${data.summary.total_failed} failed`);
      }
    } catch (err: any) {
      toast.error('Comic repair failed', { description: err.message });
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

  const changedDiffs = diffs.filter(d => d.title_changed || d.description_changed || d.image_changed || d.metafields_changed > 0);
  const errorDiffs = diffs.filter(d => d.error);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Comic Bulk Repair
        </CardTitle>
        <CardDescription>
          Fix Shopify titles, descriptions, metafields, and images for all synced comic items using the new comic-specific formatting.
          Store: <Badge variant="outline">{storeKey}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => runRepair('preview')}
            disabled={loading}
          >
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
            disabled={loading || (diffs.length > 0 && changedDiffs.length === 0)}
          >
            {loading && mode === 'execute' ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Execute Repair
          </Button>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-bold">{summary.total_comics}</div>
              <div className="text-xs text-muted-foreground">Comics Found</div>
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
                {summary.total_errors ?? summary.total_failed ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </div>
        )}

        {summary && (
          <div className="text-xs text-muted-foreground">
            Completed in {(summary.duration_ms / 1000).toFixed(1)}s · {summary.api_calls} API calls
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
                      <div className="flex gap-1 flex-wrap">
                        {diff.title_changed && <Badge variant="secondary" className="text-xs">title</Badge>}
                        {diff.description_changed && <Badge variant="secondary" className="text-xs">description</Badge>}
                        {diff.image_changed && <Badge variant="secondary" className="text-xs">image</Badge>}
                        {diff.metafields_changed > 0 && <Badge variant="secondary" className="text-xs">{diff.metafields_changed} metafields</Badge>}
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
                        <div className="text-muted-foreground">Title: {diff.current_title}</div>
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
                  <span className="font-mono">{r.sku || r.item_id.slice(0, 8)}</span>
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
