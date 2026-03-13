import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ImageIcon, Play, Square, Eye, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface RescrapeResult {
  id: string;
  cert: string;
  subject: string;
  status: string;
  images_found: number;
  changed: boolean;
}

interface BatchResponse {
  ok: boolean;
  mode: string;
  summary: {
    total_processed: number;
    updated: number;
    would_update: number;
    unchanged: number;
    no_images: number;
    errors: number;
  };
  total_in_catalog: number;
  has_more: boolean;
  next_cursor: string;
  results: RescrapeResult[];
}

export function ComicImageRescrape() {
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<'preview' | 'execute'>('preview');
  const [results, setResults] = useState<RescrapeResult[]>([]);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalInCatalog, setTotalInCatalog] = useState(0);
  const [summary, setSummary] = useState<BatchResponse['summary'] | null>(null);
  const [currentBatch, setCurrentBatch] = useState(0);
  const abortRef = useRef(false);

  const BATCH_SIZE = 20;

  const runRescrape = useCallback(async (selectedMode: 'preview' | 'execute') => {
    setIsRunning(true);
    setResults([]);
    setTotalProcessed(0);
    setSummary(null);
    setCurrentBatch(0);
    abortRef.current = false;
    setMode(selectedMode);

    const aggregatedSummary = {
      total_processed: 0,
      updated: 0,
      would_update: 0,
      unchanged: 0,
      no_images: 0,
      errors: 0,
    };

    let cursor: string | undefined;
    let batchNum = 0;

    try {
      while (true) {
        if (abortRef.current) {
          toast.info('Rescrape stopped by user');
          break;
        }

        batchNum++;
        setCurrentBatch(batchNum);

        const body: Record<string, unknown> = {
          mode: selectedMode,
          limit: BATCH_SIZE,
        };
        if (cursor) body.after_id = cursor;

        const { data, error } = await supabase.functions.invoke('comic-image-rescrape', { body });

        if (error) {
          toast.error(`Batch ${batchNum} failed: ${error.message}`);
          break;
        }

        const batch = data as BatchResponse;
        if (!batch.ok) {
          toast.error(`Batch ${batchNum} error: ${JSON.stringify(batch)}`);
          break;
        }

        setTotalInCatalog(batch.total_in_catalog);
        setResults(prev => [...prev, ...batch.results]);

        aggregatedSummary.total_processed += batch.summary.total_processed;
        aggregatedSummary.updated += batch.summary.updated;
        aggregatedSummary.would_update += batch.summary.would_update;
        aggregatedSummary.unchanged += batch.summary.unchanged;
        aggregatedSummary.no_images += batch.summary.no_images;
        aggregatedSummary.errors += batch.summary.errors;

        setTotalProcessed(aggregatedSummary.total_processed);
        setSummary({ ...aggregatedSummary });

        if (!batch.has_more) break;
        cursor = batch.next_cursor;
      }

      toast.success(`Rescrape complete: ${aggregatedSummary.total_processed} comics processed`);
    } catch (err) {
      toast.error(`Rescrape failed: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const stop = () => {
    abortRef.current = true;
  };

  const progress = totalInCatalog > 0 ? (totalProcessed / totalInCatalog) * 100 : 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'updated':
        return <Badge className="bg-green-600 text-white">Updated</Badge>;
      case 'would_update':
        return <Badge variant="outline" className="border-blue-500 text-blue-500">Would Update</Badge>;
      case 'unchanged':
        return <Badge variant="secondary">Unchanged</Badge>;
      case 'no_images_found':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500">No Images</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'skipped_no_cert':
        return <Badge variant="outline">No Cert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Comic Image Rescrape
        </CardTitle>
        <CardDescription>
          Re-scrape all comic PSA cert images from PSA website. Preview first to see what would change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={() => runRescrape('preview')}
            disabled={isRunning}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button
            onClick={() => runRescrape('execute')}
            disabled={isRunning}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            Execute Rescrape
          </Button>
          {isRunning && (
            <Button onClick={stop} variant="destructive" className="flex items-center gap-2">
              <Square className="h-4 w-4" />
              Stop
            </Button>
          )}
        </div>

        {isRunning && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Batch {currentBatch} • {totalProcessed} / {totalInCatalog || '?'} comics</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="flex items-center gap-1 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {mode === 'execute' ? summary.updated : summary.would_update} {mode === 'execute' ? 'updated' : 'would update'}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              unchanged: {summary.unchanged}
            </div>
            <div className="flex items-center gap-1 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              no images: {summary.no_images}
            </div>
            <div className="flex items-center gap-1 text-sm">
              <XCircle className="h-4 w-4 text-destructive" />
              errors: {summary.errors}
            </div>
            <div className="text-sm text-muted-foreground">
              total: {summary.total_processed}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <ScrollArea className="h-64 border rounded-md">
            <div className="p-2 space-y-1">
              {results.map((r, i) => (
                <div key={`${r.id}-${i}`} className="flex items-center justify-between text-sm py-1 px-2 hover:bg-muted/50 rounded">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-xs text-muted-foreground">{r.cert}</span>
                    <span className="truncate">{r.subject || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-muted-foreground">{r.images_found} img</span>
                    {statusBadge(r.status)}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
