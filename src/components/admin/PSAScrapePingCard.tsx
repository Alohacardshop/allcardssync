import { useState } from "react";
import { invokePSAScrape } from "@/lib/psaService";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function PSAScrapePingCard() {
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function onPing() {
    setLoading(true);
    try {
      const data = await invokePSAScrape({ mode: "ping" }, 20000);
      setOut(data);
    } catch (e: any) {
      setOut({ ok: false, error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">psa-scrape Reachability</CardTitle>
          <Button variant="outline" onClick={onPing} disabled={loading}>
            {loading ? "Pinging…" : "Ping psa-scrape"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="text-xs overflow-auto max-h-64 bg-muted p-3 rounded">
          {out ? JSON.stringify(out, null, 2) : "—"}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          Open DevTools → Network and verify OPTIONS → POST.
        </p>
      </CardContent>
    </Card>
  );
}