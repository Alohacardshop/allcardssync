import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function CardShowAddItems() {
  const [urls, setUrls] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleSubmit = async () => {
    const urlList = urls
      .split("\n")
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urlList.length === 0) {
      toast.error("Please enter at least one ALT URL");
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      // TODO: Call edge function to process URLs
      toast.info("ALT scraping not yet implemented - coming soon!");
      
      // Placeholder for edge function call:
      // const { data, error } = await supabase.functions.invoke('card-show-fetch-alt', {
      //   body: {
      //     items: urlList.map(url => ({ alt_url: url })),
      //     defaults: {
      //       buy: buyPrice ? { price: parseFloat(buyPrice) } : undefined,
      //       sell: sellPrice ? { price: parseFloat(sellPrice) } : undefined
      //     }
      //   }
      // });

      setResults({
        totalProcessed: urlList.length,
        successCount: 0,
        failed: urlList,
        needsSession: true
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to process items");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold mb-2">Add Items from ALT</h2>
        <p className="text-muted-foreground">
          Enter ALT Research URLs (one per line) to fetch card details and add to inventory.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 rounded">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          💡 <strong>Tip:</strong> For single certificate lookups, use the <strong>Lookup Cert</strong> tab for a faster experience!
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="urls">ALT Research URLs</Label>
          <Textarea
            id="urls"
            placeholder="https://app.alt.xyz/research/..."
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={10}
            className="font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="buyPrice">Default Buy Price (optional)</Label>
            <Input
              id="buyPrice"
              type="number"
              placeholder="0.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sellPrice">Default Sell Price (optional)</Label>
            <Input
              id="sellPrice"
              type="number"
              placeholder="0.00"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isProcessing}
          className="w-full"
        >
          {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isProcessing ? "Processing..." : "Fetch from ALT"}
        </Button>
      </div>

      {results && (
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="font-semibold">Results</h3>
          <div className="space-y-1 text-sm">
            <p>Total Processed: {results.totalProcessed}</p>
            <p className="text-green-600">Success: {results.successCount}</p>
            <p className="text-red-600">Failed: {results.failed?.length || 0}</p>
            {results.needsSession && (
              <p className="text-amber-600">⚠️ ALT session needs to be initialized by admin</p>
            )}
          </div>
          {results.failed && results.failed.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-muted-foreground">
                View failed URLs
              </summary>
              <ul className="mt-2 space-y-1 text-xs font-mono">
                {results.failed.map((url: string, i: number) => (
                  <li key={i} className="text-red-600">{url}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
