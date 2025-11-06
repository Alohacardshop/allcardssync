import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";

export function CardShowAddByCert() {
  const [certNumber, setCertNumber] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [selectedShowId, setSelectedShowId] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: shows } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, name")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const lookupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("card-show-fetch-alt", {
        body: {
          certNumber: certNumber.trim(),
          defaults: {
            buy: buyPrice ? { price: parseFloat(buyPrice), showId: selectedShowId || null } : undefined,
            sell: sellPrice ? { price: parseFloat(sellPrice), showId: selectedShowId || null } : undefined,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data.card);
      toast.success("Card fetched successfully from ALT!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to lookup certificate");
      setResult(null);
    },
  });

  const handleLookup = () => {
    if (!certNumber.trim()) {
      toast.error("Please enter a certificate number");
      return;
    }
    lookupMutation.mutate();
  };

  const getGradeBadgeColor = (grade: string) => {
    const num = parseInt(grade);
    if (num === 10) return "bg-gradient-to-r from-yellow-400 to-amber-500 text-black";
    if (num >= 9) return "bg-blue-600";
    if (num >= 8) return "bg-green-600";
    if (num >= 7) return "bg-amber-600";
    return "bg-gray-600";
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold mb-2">Certificate Lookup</h2>
        <p className="text-muted-foreground">
          Enter a certificate number to automatically fetch card details from ALT via ScrapingBee
        </p>
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <div>
          <Label htmlFor="cert-number">Certificate Number</Label>
          <Input
            id="cert-number"
            placeholder="115164590 (ALT will auto-detect grading service)"
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="buy-price">Buy Price (optional)</Label>
            <Input
              id="buy-price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sell-price">Sell Price (optional)</Label>
            <Input
              id="sell-price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="show">Show (optional)</Label>
          <Select value={selectedShowId} onValueChange={setSelectedShowId}>
            <SelectTrigger id="show">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {shows?.map((show) => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleLookup}
          disabled={lookupMutation.isPending}
          className="w-full"
        >
          {lookupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {lookupMutation.isPending ? "Looking up..." : "Lookup Certificate"}
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-6 space-y-4 bg-card">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-semibold mb-2">{result.title}</h3>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={getGradeBadgeColor(result.grade || "0")}>
                  {result.grading_service} {result.grade}
                </Badge>
                {result.set_name && <Badge variant="outline">{result.set_name}</Badge>}
              </div>
              {result.population && (
                <p className="text-sm text-muted-foreground">
                  Population: {result.population}
                </p>
              )}
              {result.alt_value && (
                <p className="text-lg font-semibold mt-2 text-green-600">
                  ALT Value: ${result.alt_value.toFixed(2)}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Last checked: {new Date(result.alt_checked_at).toLocaleString()}
              </p>
            </div>
            {result.image_url && (
              <img
                src={result.image_url}
                alt={result.title}
                className="w-32 h-auto rounded border"
              />
            )}
          </div>

          {result.alt_url && (
            <a
              href={result.alt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View on ALT <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 rounded">
            <p className="text-sm text-green-900 dark:text-green-100">
              ✓ Card saved to inventory successfully!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
