import { useState } from "react";
import { invokePSAScrapeV2 } from "@/lib/psaServiceV2";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function PSAScrapePingCard() {
  const [out, setOut] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function onPing() {
    setLoading(true);
    try {
      const data = await invokePSAScrapeV2({ mode: "ping" }, 5000);
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
          <CardTitle className="text-lg font-semibold">psa-scrape-v2 Reachability</CardTitle>
          <Button variant="outline" onClick={onPing} disabled={loading}>
            {loading ? "Pinging…" : "Ping psa-scrape-v2"}
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