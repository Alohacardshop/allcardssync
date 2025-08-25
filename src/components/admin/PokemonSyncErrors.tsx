import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SyncError {
  set_id: string;
  step: string;
  message: string;
  created_at: string;
}

export default function PokemonSyncErrors() {
  const [rows, setRows] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-errors');

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
      const { error } = await supabase.functions.invoke('catalog-sync-pokemon', {
        body: { setId }
      });

      if (error) {
        toast.error(`Failed to retry set ${setId}: ${error.message}`);
        return;
      }

      toast.success(`Retrying sync for set ${setId}`);
      await load(); // Refresh the list
    } catch (err: any) {
      console.error('Error retrying sync:', err);
      toast.error(`Failed to retry sync: ${err.message}`);
    }
  }

  useEffect(() => { 
    load(); 
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pokémon Sync — Recent Failures</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
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