import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const [results, setResults] = useState<any[]>([]);
  const queryClient = useQueryClient();

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
            buy: buyPrice ? { price: parseFloat(buyPrice), showId: (selectedShowId && selectedShowId !== "none") ? selectedShowId : null } : undefined,
            sell: sellPrice ? { price: parseFloat(sellPrice), showId: (selectedShowId && selectedShowId !== "none") ? selectedShowId : null } : undefined,
          },
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResults(data.cards || []);
      toast.success(`Found ${data.count || 0} card(s) from ALT!`);
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to lookup certificate");
      setResults([]);
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
    if (num === 10) return "bg-rare text-foreground";
    if (num >= 9) return "bg-primary text-primary-foreground";
    if (num >= 8) return "bg-success text-success-foreground";
    if (num >= 7) return "bg-warning text-warning-foreground";
    return "bg-muted text-muted-foreground";
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
              <SelectItem value="none">None</SelectItem>
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

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="status-success p-4 rounded">
            <p className="text-sm">
              ✓ {results.length} card(s) fetched and saved! Go to Dashboard to review and send to inventory.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {results.map((card, index) => (
              <div key={index} className="rounded-lg border p-6 space-y-4 bg-card">
                <div className="flex items-start gap-4">
                  {card.image_url && (
                    <img
                      src={card.image_url}
                      alt={card.title}
                      className="w-24 h-32 object-contain rounded border"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold mb-2 truncate">{card.title}</h3>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {card.grading_service && (
                        <Badge variant="secondary">{card.grading_service}</Badge>
                      )}
                      {card.grade && (
                        <Badge className={getGradeBadgeColor(card.grade)}>
                          Grade {card.grade}
                        </Badge>
                      )}
                    </div>
                    {card.set_name && (
                      <Badge variant="outline" className="mb-2">{card.set_name}</Badge>
                    )}
                  </div>
                </div>
                
                <div className="space-y-1">
                  {card.alt_value && (
                    <p className="text-lg font-semibold text-success">
                      ALT Value: ${card.alt_value.toFixed(2)}
                    </p>
                  )}
                  {card.population && (
                    <p className="text-sm text-muted-foreground">
                      Population: {card.population}
                    </p>
                  )}
                  {card.alt_checked_at && (
                    <p className="text-xs text-muted-foreground">
                      Last checked: {new Date(card.alt_checked_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {card.alt_url && (
                  <a
                    href={card.alt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    View on ALT <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
