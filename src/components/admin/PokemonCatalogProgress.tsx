import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const FUNCTIONS_BASE = "https://dmpoandoydaqxhzdjnmk.functions.supabase.co";

export default function PokemonCatalogProgress() {
  const [stats, setStats] = useState<{sets:number; cards:number; pending:number}>({sets:0,cards:0,pending:0});
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);

  async function loadStats() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("catalog_v2_stats", { game_in: "pokemon" });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setStats({
        sets: Number(row?.sets_count ?? 0),
        cards: Number(row?.cards_count ?? 0),
        pending: Number(row?.pending_sets ?? 0),
      });
    } catch (e:any) {
      toast.error(e.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  async function queueAll() {
    setQueueing(true);
    try {
      const { data, error } = await supabase.rpc("catalog_v2_queue_pending_sets", {
        game_in: "pokemon",
        functions_base: FUNCTIONS_BASE,
      });
      if (error) throw error;
      toast.success(`Queued ${data ?? 0} sets`);
      setTimeout(loadStats, 1500);
    } catch (e:any) {
      toast.error(e.message || "Queue failed");
    } finally {
      setQueueing(false);
    }
  }

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 10000);
    return () => clearInterval(t);
  }, []);

  const syncing = loading; // only spin when you're fetching stats

  return (
    <Card>
      <CardHeader><CardTitle>Pokémon Catalog — Progress</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-2xl font-semibold">{stats.sets}</div><div className="text-xs text-muted-foreground">Sets</div></div>
          <div><div className="text-2xl font-semibold">{stats.cards}</div><div className="text-xs text-muted-foreground">Cards</div></div>
          <div>
            <div className="text-2xl font-semibold flex items-center justify-center">
              {stats.pending}
              {syncing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.pending === 0 ? "Up to date" : (syncing ? "Syncing…" : "Pending Sets")}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadStats} variant="secondary" disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
          <Button onClick={queueAll} disabled={queueing || stats.pending === 0}>
            {queueing ? "Queuing…" : "Queue All Pending Sets"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}