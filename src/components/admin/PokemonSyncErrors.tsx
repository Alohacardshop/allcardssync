import { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

const FUNCTIONS_BASE = "https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1";

interface SyncError {
  set_id: string;
  step: string;
  message: string;
  created_at: string;
}

interface PokemonSyncErrorsProps {
  autoRefresh?: boolean;
  game?: string;
  title?: string;
}

export default function PokemonSyncErrors({ autoRefresh = false, game = 'pokemon', title = 'Pokémon Sync — Recent Failures' }: PokemonSyncErrorsProps) {
  const [rows, setRows] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(false);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-errors', {
        body: { game, limit: 20 }
      });

      if (error) {
        console.error('Error loading sync errors:', error);
        toast.error('Failed to load sync errors');
        return;
      }

      setRows(data?.data || []);
    } catch (err: any) {
      console.error('Error loading sync errors:', err);
      toast.error('Failed to load sync errors');
    } finally {
      setLoading(false);
    }
  }

  async function retry(setId: string) {
    try {
      // Use unified catalog-sync endpoint
      const gameParam = game === 'mtg' ? 'mtg' : game === 'pokemon_japan' ? 'pokemon-japan' : 'pokemon';
      const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
      url.searchParams.set('game', gameParam);
      url.searchParams.set('setId', setId);

      const response = await fetch(url.toString(), { method: "POST" });

      if (!response.ok) {
        toast.error(`Failed to retry set ${setId}`);
        return;
      }

      toast.success(`Retrying sync for set ${setId}`);
      await load(); // Refresh the list
    } catch (err: any) {
      console.error('Error retrying sync:', err);
      toast.error(`Failed to retry sync: ${err.message}`);
    }
  }

  async function retryAllFailures() {
    const ids = Array.from(new Set(rows.map(r => r.set_id))).filter(Boolean);
    
    const gameParam = game === 'mtg' ? 'mtg' : game === 'pokemon_japan' ? 'pokemon-japan' : 'pokemon';
    
    for (const id of ids) {
      try {
        const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
        url.searchParams.set('game', gameParam);
        url.searchParams.set('setId', id);
        await fetch(url.toString(), { method: "POST" });
      } catch (err) {
        console.error(`Failed to retry set ${id}:`, err);
      }
    }
    
    toast.success(`Re-queued ${ids.length} sets`);
  }

  useEffect(() => { 
    load(); 
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Auto-refresh when sync is active
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(load, 15000); // Every 15 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {title}
          {autoRefresh && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="sm" onClick={retryAllFailures} disabled={rows.length === 0}>
            Retry All
          </Button>
          {autoRefresh && (
            <span className="text-xs text-muted-foreground">Auto-refreshing every 15s</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Click retry to re-queue a failing set.</div>
        <div className="divide-y border rounded">
          {rows.map((r, i) => (
            <div key={i} className="p-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-sm truncate">{r.set_id}</div>
                <div className="text-xs text-muted-foreground truncate">{r.step}: {r.message}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <Button size="sm" onClick={() => retry(r.set_id)}>Retry</Button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No recent errors 🎉</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}