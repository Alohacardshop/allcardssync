import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle, Database, Calendar } from "lucide-react";

const SETTING_KEY = "POKEMON_V2_BACKFILL_DONE";

const FUNCTIONS_BASE = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1`;

export default function PokemonOneTimeBackfill() {
  const [done, setDone] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<{
    sets: number;
    cards: number;
    totalSets: number;
    currentSet?: string;
  }>({ sets: 0, cards: 0, totalSets: 0 });
  const [showIncremental, setShowIncremental] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  useEffect(() => {
    checkBackfillStatus();
    loadCatalogStats();
  }, []);

  const checkBackfillStatus = async () => {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key_value")
      .eq("key_name", SETTING_KEY)
      .maybeSingle();
    if (!error && data?.key_value === "true") setDone(true);
  };

  const loadCatalogStats = async () => {
    try {
      const { data, error } = await supabase.rpc("catalog_v2_stats", { game_in: "pokemon" });
      if (error) throw error;
      
      const row = Array.isArray(data) ? data[0] : data; // supabase-js returns array for set-returning functions
      setProgress(prev => ({
        ...prev,
        sets: Number(row?.sets_count ?? 0),
        cards: Number(row?.cards_count ?? 0),
        totalSets: Number(row?.pending_sets ?? 0),
      }));
      
      setShowIncremental(true);
    } catch (error) {
      console.error("Error loading catalog stats:", error);
      setShowIncremental(true);
      // Set fallback values on error
      setProgress(prev => ({
        ...prev,
        sets: 0,
        cards: 0,
        totalSets: 0,
      }));
    }
  };

  const runBackfill = async (incremental = false) => {
    try {
      setLoading(true);
      setResult(null);
      setStartTime(Date.now()); // Reset start time
      setProgress(prev => ({ ...prev, currentSet: "Starting..." }));

      // Use proper Supabase client instead of direct fetch
      const params = incremental ? { since: getRecentDate() } : {};
      
      const { data, error } = await supabase.functions.invoke('catalog-sync-pokemon', {
        body: params
      });
      
      setResult({ 
        ok: !error, 
        data, 
        error: error?.message, 
        at: new Date().toISOString() 
      });
      
      if (error) {
        toast.error(`Backfill failed: ${error.message}`);
        return;
      }

      // Start polling for progress
      if (data?.queued_sets) {
        pollProgress(data.queued_sets);
      }

      // Only mark as fully done for full backfill
      if (!incremental) {
        const { error: settingError } = await supabase
          .from("system_settings")
          .upsert({ key_name: SETTING_KEY, key_value: "true" }, { onConflict: "key_name" });
        
        if (settingError) {
          toast.error("Backfill ok, but failed to save completion flag.");
        } else {
          setDone(true);
          toast.success("Pokémon catalog backfilled and locked.");
        }
      } else {
        toast.success(`Incremental sync started for ${data?.queued_sets || 0} sets`);
      }
    } catch (e: any) {
      console.error("Backfill error:", e);
      toast.error(`Backfill error: ${e?.message || "Unknown error"}`);
      setResult({ 
        ok: false, 
        error: e?.message || "Unknown error", 
        at: new Date().toISOString() 
      });
    } finally {
      setLoading(false);
    }
  };

  const getRecentDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 6); // Last 6 months
    return date.toISOString().split('T')[0];
  };

  const queueAllPending = async () => {
    setQueueing(true);
    try {
      const { data, error } = await supabase.rpc("catalog_v2_queue_pending_sets", {
        game_in: "pokemon",
        functions_base: FUNCTIONS_BASE,
      });
      if (error) throw error;
      toast.success(`Queued ${data ?? 0} sets`);
      await loadCatalogStats(); // refresh stats after queuing
    } catch (e: any) {
      toast.error(e.message || "Failed to queue");
    } finally {
      setQueueing(false);
    }
  };

  const pollProgress = async (totalSets: number) => {
    // Simplified progress polling without DB queries
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const estimatedProgress = Math.min((elapsed / (totalSets * 500)), 1); // Rough estimate
      
      setProgress(prev => ({
        ...prev,
        totalSets: totalSets,
        currentSet: estimatedProgress < 1 ? `Estimated progress: ${Math.round(estimatedProgress * 100)}%` : "Complete!"
      }));

      // Stop polling when loading finished
      if (!loading) {
        clearInterval(interval);
        setProgress(prev => ({ ...prev, currentSet: undefined }));
      }
    }, 2000);

    // Clean up after 10 minutes max
    setTimeout(() => clearInterval(interval), 600000);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Pokémon Catalog Management
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
              {done ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : progress.cards > 0 ? (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              ) : (
                <Database className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant={done ? "default" : progress.cards > 0 ? "secondary" : "outline"}>
                {done ? "Complete" : progress.cards > 0 ? "Partial" : "Empty"}
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

        {/* Action Buttons */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={() => runBackfill(false)} 
              disabled={loading || done || queueing}
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : done ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              {done ? "Already Backfilled" : (loading ? "Backfilling…" : "Run Full Backfill")}
            </Button>

            {progress.totalSets > 0 && (
              <Button 
                variant="secondary" 
                onClick={queueAllPending} 
                disabled={queueing || loading}
                className="flex items-center gap-2"
              >
                {queueing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                {queueing ? "Queuing…" : `Queue All Pending Sets (${progress.totalSets})`}
              </Button>
            )}

            {showIncremental && !done && (
              <Button 
                variant="outline"
                onClick={() => runBackfill(true)} 
                disabled={loading || queueing}
                className="flex items-center gap-2"
              >
                <Calendar className="h-4 w-4" />
                Incremental Sync (6 months)
              </Button>
            )}

            {done && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setDone(false);
                  supabase.from("system_settings").delete().eq("key_name", SETTING_KEY);
                }}
              >
                Unlock for Re-run
              </Button>
            )}
          </div>

          {done && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 p-2 rounded">
              <CheckCircle className="h-3 w-3" />
              <span>Full backfill completed and locked ({SETTING_KEY})</span>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            <strong>Full Backfill:</strong> Fetches all Pokémon sets & cards into catalog_v2. 
            Runs once and locks itself. Pricing data is not included.
          </p>
          {showIncremental && (
            <p>
              <strong>Incremental Sync:</strong> Updates only sets released in the last 6 months. 
              Good for catching new releases.
            </p>
          )}
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