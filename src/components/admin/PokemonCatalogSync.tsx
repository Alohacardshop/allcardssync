import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.replace(/\/+$/, "") || "/functions/v1";

export default function PokemonCatalogSync() {
  const [setId, setSetId] = useState("");
  const [since, setSince] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function callSync(params: { setId?: string; since?: string } = {}) {
    setLoading(true);
    try {
      const u = new URL(`${FUNCTIONS_BASE}/catalog-sync-pokemon`, window.location.origin);
      if (params.setId) u.searchParams.set("setId", params.setId);
      if (params.since) u.searchParams.set("since", params.since);
      const res = await fetch(u.toString(), { method: "POST" });
      const json = await res.json();
      setResult({ ok: res.ok, ...json, at: new Date().toISOString() });
    } catch (e:any) {
      setResult({ ok: false, error: e?.message || "error", at: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pokémon Catalog Sync (On-Demand)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-sm">Set ID (optional)</label>
            <Input placeholder="e.g. sv6pt5" value={setId} onChange={(e)=>setSetId(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Since (YYYY-MM-DD, optional)</label>
            <Input placeholder="e.g. 2025-07-01" value={since} onChange={(e)=>setSince(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button disabled={loading} onClick={()=>callSync({ setId: setId || undefined, since: since || undefined })}>
              {loading ? "Syncing…" : "Sync Now"}
            </Button>
            <Button variant="secondary" disabled={loading} onClick={()=>callSync()}>
              Full Backfill
            </Button>
          </div>
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