import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";

const FUNCTIONS_BASE =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.replace(/\/+$/, "") || "/functions/v1";

const SETTING_KEY = "POKEMON_V2_BACKFILL_DONE";

// NOTE: We assume your Admin page already has a logged-in admin with RLS allowing system_settings updates.
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
);

export default function PokemonOneTimeBackfill() {
  const [done, setDone] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    // check flag
    (async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key_value")
        .eq("key_name", SETTING_KEY)
        .maybeSingle();
      if (!error && data?.key_value === "true") setDone(true);
    })();
  }, []);

  async function runBackfill() {
    try {
      setLoading(true);
      setResult(null);
      const res = await fetch(`${FUNCTIONS_BASE}/catalog-sync-pokemon`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setResult({ ok: res.ok, ...json, at: new Date().toISOString() });
      if (!res.ok) {
        toast.error(`Backfill failed: ${res.status}`);
        return;
      }
      // mark one-time flag
      const { error } = await supabase
        .from("system_settings")
        .upsert({ key_name: SETTING_KEY, key_value: "true" }, { onConflict: "key_name" });
      if (error) {
        toast.error("Backfill ok, but failed to save completion flag.");
      } else {
        setDone(true);
        toast.success("Pokémon catalog backfilled and locked.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Backfill error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pokémon Catalog — One-Time Backfill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This will fetch all Pokémon sets & cards into <code>catalog_v2</code> (names, numbers, images).
          Pricing is not touched. This button disables itself after a successful run.
        </p>

        <div className="flex items-center gap-2">
          <Button onClick={runBackfill} disabled={loading || done}>
            {done ? "Already Backfilled" : (loading ? "Backfilling…" : "Run Full Backfill")}
          </Button>
          {done && <span className="text-xs text-green-600">Locked (POKEMON_V2_BACKFILL_DONE)</span>}
        </div>

        {result && (
          <pre className="bg-muted p-3 rounded text-xs overflow-auto">
{JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}