import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle, Database, Calendar, RefreshCw } from "lucide-react";

const FUNCTIONS_BASE = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1`;

interface CatalogProgressCardProps {
  game: string;
  functionPath: string;
  title: string;
}

export default function CatalogProgressCard({ game, functionPath, title }: CatalogProgressCardProps) {
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [setId, setSetId] = useState("");
  const [since, setSince] = useState("");
  const [progress, setProgress] = useState<{
    sets: number;
    cards: number;
    totalSets: number;
    currentSet?: string;
  }>({ sets: 0, cards: 0, totalSets: 0 });
  const [startTime, setStartTime] = useState(Date.now());
  const [isActiveSync, setIsActiveSync] = useState(false);
  
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadCatalogStats();
    
    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [game]);

  // Start auto-refresh when sync is active
  useEffect(() => {
    if (isActiveSync) {
      // Auto-refresh stats every 5 seconds
      statsIntervalRef.current = setInterval(loadCatalogStats, 5000);
    } else {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
        statsIntervalRef.current = null;
      }
    }
    
    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [isActiveSync, game]);

  const loadCatalogStats = async () => {
    try {
      const { data, error } = await supabase.rpc("catalog_v2_stats", { game_in: game });
      if (error) throw error;
      
      const row = Array.isArray(data) ? data[0] : data;
      const pendingSets = Number(row?.pending_sets ?? 0);
      
      setProgress(prev => ({
        ...prev,
        sets: Number(row?.sets_count ?? 0),
        cards: Number(row?.cards_count ?? 0),
        totalSets: pendingSets,
      }));
      
      // Update active sync status based on pending sets
      setIsActiveSync(pendingSets > 0);
      
    } catch (error) {
      console.error("Error loading catalog stats:", error);
      // Set fallback values on error
      setProgress(prev => ({
        ...prev,
        sets: 0,
        cards: 0,
        totalSets: 0,
      }));
      setIsActiveSync(false);
    }
  };

  const callSync = async (params: { setId?: string; since?: string } = {}) => {
    setLoading(true);
    setResult(null);
    setStartTime(Date.now());
    
    try {
      const url = new URL(`${FUNCTIONS_BASE}${functionPath}`, window.location.origin);
      if (params.setId) url.searchParams.set("set", params.setId);
      if (params.since) url.searchParams.set("since", params.since);
      
      const res = await fetch(url.toString(), { method: "POST" });
      const json = await res.json();
      setResult({ ok: res.ok, ...json, at: new Date().toISOString() });
      
      if (res.ok) {
        if (json.queued_sets) {
          toast.success(`${title}: Started sync for ${json.queued_sets} sets`);
          setIsActiveSync(true);
        } else if (json.cards !== undefined) {
          toast.success(`${title}: Synced ${json.cards} cards`);
        } else {
          toast.success(`${title}: Sync completed`);
        }
        // Refresh stats after sync
        await loadCatalogStats();
      } else {
        toast.error(`${title}: ${json.error || 'Sync failed'}`);
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "error", at: new Date().toISOString() });
      toast.error(`${title}: ${e?.message || 'Sync failed'}`);
    } finally {
      setLoading(false);
    }
  };

  const queueAllPending = async () => {
    setQueueing(true);
    try {
      const { data, error } = await supabase.rpc("catalog_v2_queue_pending_sets_generic", {
        game_in: game,
        functions_base: FUNCTIONS_BASE,
        function_path: functionPath
      });
      if (error) throw error;
      toast.success(`${title}: Queued ${data ?? 0} sets`);
      await loadCatalogStats(); // refresh stats after queuing
      setIsActiveSync(true); // Start monitoring sync progress
    } catch (e: any) {
      toast.error(`${title}: ${e.message || "Failed to queue"}`);
    } finally {
      setQueueing(false);
    }
  };

  const getRecentDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6); // Last 6 months
    return date.toISOString().split('T')[0];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{progress.sets}</div>
            <div className="text-xs text-muted-foreground">Sets in Catalog</div>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{progress.cards}</div>
            <div className="text-xs text-muted-foreground">Cards in Catalog</div>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{progress.totalSets}</div>
            <div className="text-xs text-muted-foreground">Pending Sets</div>
            <div className="flex items-center justify-center gap-1 mt-1">
              {isActiveSync ? (
                <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
              ) : progress.cards > 0 ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Database className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant={isActiveSync ? "secondary" : progress.cards > 0 ? "default" : "outline"}>
                {isActiveSync ? "Syncing..." : progress.cards > 0 ? "Ready" : "Empty"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Progress Tracking */}
        {loading && progress.totalSets > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Processing Sets</span>
              <span>{progress.sets}/{progress.totalSets}</span>
            </div>
            <Progress value={(progress.sets / progress.totalSets) * 100} className="w-full" />
            {progress.currentSet && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {progress.currentSet}
              </div>
            )}
          </div>
        )}

        {/* Manual Sync Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-sm">Set Name (optional)</label>
            <Input 
              placeholder="e.g. Base Set" 
              value={setId} 
              onChange={(e) => setSetId(e.target.value)} 
              disabled={loading || queueing}
            />
          </div>
          <div>
            <label className="text-sm">Since (YYYY-MM-DD, optional)</label>
            <Input 
              placeholder="e.g. 2025-01-01" 
              value={since} 
              onChange={(e) => setSince(e.target.value)} 
              disabled={loading || queueing}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button 
              disabled={loading || queueing} 
              onClick={() => callSync({ setId: setId || undefined, since: since || undefined })}
              className="flex-1"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={() => callSync()} 
            disabled={loading || queueing}
            className="flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {loading ? "Running Full Sync…" : "Run Full Sync"}
          </Button>

          <Button 
            variant="secondary" 
            onClick={queueAllPending} 
            disabled={queueing || loading || progress.totalSets === 0}
            className="flex items-center gap-2"
          >
            {queueing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            {queueing ? "Queuing…" : `Queue All Pending Sets (${progress.totalSets})`}
          </Button>

          <Button 
            variant="outline"
            onClick={() => callSync({ since: getRecentDate() })} 
            disabled={loading || queueing}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Incremental Sync (6 months)
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <strong>Full Sync:</strong> Fetches all sets & cards for {game}. 
            Uses JustTCG API for comprehensive catalog data.
          </p>
          <p>
            <strong>Queue Pending:</strong> Processes sets that haven't been synced yet. 
            Good for resuming interrupted syncs.
          </p>
        </div>

        {/* Results Display */}
        {result && (
          <details className="space-y-2">
            <summary className="cursor-pointer text-sm font-medium">
              Last Operation Result {result.ok ? "✅" : "❌"}
            </summary>
            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-48">
{JSON.stringify(result, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}