import { useEffect, useMemo, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GAME_OPTIONS, GameKey } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface RawTradeInForm {
  game: string;
  name: string;
  set?: string;
  set_code?: string;
  card_number?: string;
  condition?: string;
  language?: string;
  printing?: string;
  rarity?: string;
  quantity: number;
  price_each?: string;
  cost_each?: string;
  sku?: string;
  product_id?: number;
}

const gameAbbr = (g: string) => {
  const key = g.toLowerCase();
  if (key.includes("pok")) return "PKM";
  if (key.includes("magic") || key.includes("mtg")) return "MTG";
  if (key.includes("yugi")) return "YGO";
  if (key.includes("sport")) return "SPT";
  return "GEN";
};

export default function RawIntake() {
  const [form, setForm] = useState<RawTradeInForm>({
    game: "Pokémon",
    name: "",
    set: "",
    set_code: "",
    card_number: "",
    condition: "Near Mint",
    language: "English",
    printing: "Unlimited",
    rarity: "",
    quantity: 1,
    price_each: "",
    cost_each: "",
    sku: "",
    product_id: undefined,
  });
  
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const autoSku = useMemo(() => {
    const condMap: Record<string, string> = {
      "Near Mint": "NM",
      "Lightly Played": "LP",
      "Moderately Played": "MP",
      "Heavily Played": "HP",
      "Damaged": "DMG",
    };
    const printMap: Record<string, string> = {
      "Unlimited": "UNL",
      "1st Edition": "1ED",
      "Shadowless": "SHDW",
      "Holo": "HOLO",
      "Reverse Holo": "RH",
      "Non-Holo": "NH",
    };

    const cond = condMap[form.condition || ""] || (form.condition || "").toUpperCase().replace(/\s+/g, "");
    const print = printMap[form.printing || ""] || (form.printing || "").toUpperCase().replace(/\s+/g, "");

    if (form.product_id) {
      return `${form.product_id}-${cond || "UNK"}-${print || "UNK"}`;
    }

    const ab = gameAbbr(form.game);
    const setc = (form.set_code || "GEN").toUpperCase();
    const no = (form.card_number || "NA").toUpperCase();
    return `${ab}-${setc}-${no}-${cond || "UNK"}-${print || "UNK"}`;
  }, [form.product_id, form.condition, form.printing, form.game, form.set_code, form.card_number]);

  useEffect(() => {
    setForm((f) => ({ ...f, sku: autoSku }));
  }, [autoSku]);

  const doSearch = async () => {
    const rawName = (form.name || "").trim();
    if (rawName.length < 3) {
      toast.error('Please enter at least 3 characters for the card name');
      return;
    }

    setLoading(true);
    try {
      // Search local catalog only
      const gameMap: Record<string, string> = {
        'Pokémon': 'pokemon',
        'Pokémon Japan': 'pokemon-japan',
        'Magic: The Gathering': 'mtg'
      };
      const gameParam = gameMap[form.game] || 'pokemon';
      
      const { data, error } = await supabase.rpc('catalog_v2_browse_cards', {
        game_in: gameParam,
        search_in: rawName,
        limit_in: 5
      });

      if (error) throw error;

      const results = (data as any)?.cards || [];
      setSuggestions(results);
    } catch (e: any) {
      console.error('Catalog search error:', e);
      setSuggestions([]);
      toast.error('Failed to search cards. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const applySuggestion = (s: any) => {
    setForm((f) => ({
      ...f,
      name: s.name || f.name,
      set: s.set_id || f.set,
      card_number: String(s.number || f.card_number),
      condition: f.condition,
      language: f.language,
      printing: f.printing,
      rarity: f.rarity,
      price_each: f.price_each,
      cost_each: f.cost_each,
      sku: f.sku,
      product_id: undefined,
    }));
  };

  const addToBatch = async () => {
    if (!form.name?.trim()) {
      toast.error("Name is required to add to batch");
      return;
    }
    const insertPayload = {
      year: null,
      brand_title: form.set || form.game || null,
      subject: form.name || null,
      category: form.printing ? `Raw ${form.printing}` : 'Raw',
      variant: form.condition || null,
      card_number: form.card_number || null,
      grade: null,
      psa_cert: null,
      price: form.price_each ? Number(form.price_each) : null,
      cost: form.cost_each ? Number(form.cost_each) : null,
      sku: form.sku || autoSku,
    } as const;

    try {
      const { data, error } = await supabase
        .from("intake_items")
        .insert(insertPayload)
        .select("*")
        .single();
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('intake:item-added', { detail: data }));
      toast.success(`Added to batch (Lot ${data?.lot_number || ''})`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to add to batch");
    }
  };

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      set: form.set || null,
      set_code: form.set_code || null,
      card_number: form.card_number || null,
      condition: form.condition || null,
      language: form.language || null,
      printing: form.printing || null,
      rarity: form.rarity || null,
      quantity: form.quantity || 1,
      price_each: form.price_each ? Number(form.price_each) : null,
      cost_each: form.cost_each ? Number(form.cost_each) : null,
      sku: form.sku || autoSku,
      product_id: form.product_id || null,
    } as const;

    try {
      const { error } = await supabase.from("trade_ins").insert(payload);
      if (error) throw error;
      toast.success("Raw trade-in saved");
      setForm((f) => ({ ...f, name: "", price_each: "", quantity: 1, sku: autoSku }));
    } catch (e) {
      console.error(e);
      toast.error("Failed to save raw trade-in");
    }
  };

  return (
    <div>
      <Alert className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Card search now uses local catalog data only. External sync functionality has been removed.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Game</Label>
          <Select value={form.game} onValueChange={(v) => setForm((f) => ({ ...f, game: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select game" />
            </SelectTrigger>
            <SelectContent className="z-50">
              {GAME_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="name">Name</Label>
          <Input 
            id="name" 
            value={form.name} 
            onChange={(e) => setForm({ ...form, name: e.target.value })} 
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Card name (e.g., Charizard)" 
          />
        </div>
        <div>
          <Label htmlFor="set">Set</Label>
          <Input id="set" value={form.set} onChange={(e) => setForm({ ...form, set: e.target.value })} placeholder="e.g., Base Set" />
        </div>
        <div>
          <Label htmlFor="set_code">Set Code</Label>
          <Input id="set_code" value={form.set_code} onChange={(e) => setForm({ ...form, set_code: e.target.value })} placeholder="e.g., BS" />
        </div>
        <div>
          <Label htmlFor="card_number">Card #</Label>
          <Input 
            id="card_number" 
            value={form.card_number} 
            onChange={(e) => setForm({ ...form, card_number: e.target.value })} 
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="e.g., 201/197 or 201" 
          />
        </div>
        <div>
          <Label htmlFor="condition">Condition</Label>
          <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select condition" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="Near Mint">Near Mint (NM)</SelectItem>
              <SelectItem value="Lightly Played">Lightly Played (LP)</SelectItem>
              <SelectItem value="Moderately Played">Moderately Played (MP)</SelectItem>
              <SelectItem value="Heavily Played">Heavily Played (HP)</SelectItem>
              <SelectItem value="Damaged">Damaged</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="printing">Printing</Label>
          <Select value={form.printing} onValueChange={(v) => setForm({ ...form, printing: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select print" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="Unlimited">Unlimited</SelectItem>
              <SelectItem value="1st Edition">1st Edition</SelectItem>
              <SelectItem value="Shadowless">Shadowless</SelectItem>
              <SelectItem value="Holo">Holo</SelectItem>
              <SelectItem value="Reverse Holo">Reverse Holo</SelectItem>
              <SelectItem value="Non-Holo">Non-Holo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="language">Language</Label>
          <Input id="language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="e.g., English" />
        </div>
        <div>
          <Label htmlFor="quantity">Quantity</Label>
          <Input id="quantity" type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value || 1) })} />
        </div>
        <div>
          <Label htmlFor="price_each">Price Each</Label>
          <Input id="price_each" value={form.price_each} onChange={(e) => setForm({ ...form, price_each: e.target.value })} placeholder="$" />
        </div>
        <div>
          <Label htmlFor="cost_each">Cost Each</Label>
          <Input id="cost_each" value={form.cost_each} onChange={(e) => setForm({ ...form, cost_each: e.target.value })} placeholder="$" />
        </div>
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" value={form.sku || autoSku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder={autoSku} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <Label>Suggestions</Label>
          <Button 
            size="sm" 
            onClick={doSearch}
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground mt-2">Searching…</div>
        ) : suggestions.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {suggestions.map((s, i) => (
              <li key={`${s.card_id}-${i}`} className="flex items-center gap-3 border rounded-md p-2">
                <div className="flex-1 text-sm">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-muted-foreground">{[s.set_id, s.number].filter(Boolean).join(" • ")}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => applySuggestion(s)}>Use</Button>
              </li>
            ))}
          </ul>
        ) : ((form.name || '').trim().length >= 3 ? (
          <div className="text-sm text-muted-foreground mt-2">No matches found. Try different search terms.</div>
        ) : (
          <div className="text-sm text-muted-foreground mt-2">Enter card name (3+ characters) to search</div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={addToBatch}>Add to Batch</Button>
        <Button variant="secondary" onClick={() => setForm((f) => ({ ...f, name: "", price_each: "", cost_each: "", quantity: 1, sku: autoSku, product_id: undefined }))}>Clear</Button>
      </div>
    </div>
  );
}