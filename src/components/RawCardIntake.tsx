import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { searchCardsByNameNumber, getReferencePriceByTcgplayerId, type JustTCGCard } from '@/lib/justtcg';
import { normalizeStr, normalizeNumber, includesLoose, similarityScore } from '@/lib/cardSearch';
import type { GameKey, JObjectCard, Printing } from '@/lib/types';
import { GAME_OPTIONS } from '@/lib/types';

interface RawCardIntakeProps {
  defaultGame?: GameKey;
  defaultPrinting?: Printing;
  defaultConditions?: string;
  autoSaveToBatch?: boolean;
  onPick?: (payload: {
    card: JustTCGCard;
    chosenVariant?: {
      condition: string;
      printing: Printing;
      price?: number;
    };
  }) => void;
  onBatchAdd?: (item: any) => void;
}

const PRINTINGS: Printing[] = ['Normal', 'Foil'];

export function RawCardIntake({
  defaultGame = 'pokemon',
  defaultPrinting = 'Normal',
  defaultConditions = 'NM,LP',
  autoSaveToBatch = false,
  onPick,
  onBatchAdd,
}: RawCardIntakeProps) {
  const [game, setGame] = useState<GameKey>(defaultGame);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [printing, setPrinting] = useState<Printing>(defaultPrinting);
  const [conditionCsv, setConditionCsv] = useState(defaultConditions);
  const [suggestions, setSuggestions] = useState<JustTCGCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<JustTCGCard | null>(null);
  const [chosenVariant, setChosenVariant] = useState<any>(null);
  const [referencePrice, setReferencePrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const debounceRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  const normalizedName = useMemo(() => normalizeStr(name), [name]);
  const normalizedNumber = useMemo(() => normalizeNumber(number), [number]);

  // Search effect
  useEffect(() => {
    if (!normalizedName) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await searchCardsByNameNumber({
          name: normalizedName,
          game,
          number: normalizedNumber.num,
          limit: 10
        });

        if (controller.signal.aborted) return;

        // Skip number-based filtering since JustTCG handles this
        setSuggestions(data.slice(0, 5));
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          const message = err.message || 'Failed to search cards';
          setError(message);
          toast({
            title: 'Search Error',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [game, normalizedName, normalizedNumber.num, name, number, toast]);

  const findBestVariant = (card: JObjectCard) => {
    const preferences = conditionCsv.split(',').map(s => s.trim()).filter(Boolean);
    const variants = card.variants || [];

    // Condition mapping
    const conditionMap: Record<string, string> = {
      'SEALED': 'S',
      'NEAR MINT': 'NM',
      'LIGHTLY PLAYED': 'LP',
      'MODERATELY PLAYED': 'MP',
      'HEAVILY PLAYED': 'HP',
      'DAMAGED': 'DMG',
    };

    const normalizeCondition = (cond: string) => {
      const upper = normalizeStr(cond).toUpperCase();
      return conditionMap[upper] || upper;
    };

    // Find best matching variant
    for (const prefCond of preferences) {
      const variant = variants.find(v => 
        v.printing === printing && 
        normalizeCondition(String(v.condition)) === normalizeCondition(prefCond)
      );
      if (variant) return variant;
    }

    // Fallback to any variant with matching printing
    return variants.find(v => v.printing === printing) || variants[0];
  };

  const generateSKU = (card: JustTCGCard, variant: any, game: GameKey): string => {
    const gameAbbr = game === 'pokemon' ? 'PKM' : game === 'pokemon_japan' ? 'PKJ' : 'MTG';
    const conditionAbbr = String(variant?.condition || 'NM').replace(/[^A-Z]/g, '').substring(0, 2) || 'NM';
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${gameAbbr}-${conditionAbbr}-${randomSuffix}`;
  };

  const mapGameToCategory = (game: GameKey): string => {
    switch (game) {
      case 'pokemon': return 'Pokémon';
      case 'pokemon_japan': return 'Pokémon Japan';
      case 'mtg': return 'Magic: The Gathering';
      default: return 'Trading Cards';
    }
  };

  const addToBatch = async () => {
    if (!picked || !chosenVariant) {
      toast({
        title: 'No Card Selected',
        description: 'Please select a card first',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const sku = generateSKU(picked, chosenVariant, game);
      
      const { error } = await supabase
        .from('intake_items')
        .insert({
          sku,
          subject: picked.name,
          card_number: String(picked.number || ''),
          year: '', // JustTCG doesn't provide year directly
          brand_title: picked.set || '',
          category: mapGameToCategory(game),
          variant: chosenVariant.printing,
          quantity,
          price: chosenVariant.price || null,
          cost: null, // Cost not available from JustTCG
        });

      if (error) throw error;

      // Dispatch event for real-time updates
      window.dispatchEvent(new CustomEvent('intake:item-added', {
        detail: { sku, name: picked.name, quantity }
      }));

      toast({
        title: 'Added to Batch',
        description: `${picked.name} (${quantity}x) added with SKU: ${sku}`,
      });

      onBatchAdd?.({ card: picked, variant: chosenVariant, sku, quantity });

      // Clear selection
      setPicked(null);
      setChosenVariant(null);
      setQuantity(1);
      setName('');
      setNumber('');
      setSuggestions([]);

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add item to batch',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestionClick = async (card: JustTCGCard) => {
    setPicked(card);
    
    // Get reference price if tcgplayerId exists
    let variant = null;
    let price = null;
    
    if (card.tcgplayerId) {
      try {
        const variants = await getReferencePriceByTcgplayerId(card.tcgplayerId, {
          condition: conditionCsv.split(',')[0]?.trim() || 'NM',
          printing: printing === 'Foil' ? 'Foil' : 'Normal'
        });
        
        if (variants.length > 0) {
          variant = variants[0];
          price = variant.price;
          setReferencePrice(price || null);
        }
      } catch (error) {
        console.error('Failed to get reference price:', error);
        toast({
          title: 'Price Lookup Failed',  
          description: 'Could not fetch reference price',
          variant: 'destructive',
        });
      }
    }
    
    const chosenVar = {
      condition: conditionCsv.split(',')[0]?.trim() || 'NM',
      printing: printing,
      price: price
    };
    
    setChosenVariant(chosenVar);
    
    const payload = {
      card,
      chosenVariant: chosenVar,
    };

    onPick?.(payload);

    // Auto-save if enabled
    if (autoSaveToBatch && chosenVar) {
      setTimeout(addToBatch, 100);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Raw Card Intake
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Game Selection */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="game">Game</Label>
            <Select value={game} onValueChange={(value: GameKey) => setGame(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="printing">Printing</Label>
            <Select value={printing} onValueChange={(value: Printing) => setPrinting(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINTINGS.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="conditions">Preferred Conditions (CSV)</Label>
            <Input
              id="conditions"
              placeholder="NM,LP,MP"
              value={conditionCsv}
              onChange={(e) => setConditionCsv(e.target.value)}
            />
          </div>
        </div>

        {/* Search Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="name">Card Name</Label>
            <Input
              id="name"
              placeholder="e.g., Charizard ex"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="number">Card Number (Optional)</Label>
            <Input
              id="number"
              placeholder="e.g., 201/197 or 201"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Suggestions */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Label className="text-base font-semibold">Suggestions</Label>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3" role="region" aria-live="polite">
            {suggestions.map((card, index) => (
              <Button
                key={card.id || `card-${index}`}
                variant="outline"
                className="h-auto p-3 text-left flex flex-col items-start"
                onClick={() => handleSuggestionClick(card)}
                aria-label={`Select ${card.name}`}
              >
                <div className="w-full h-32 bg-muted rounded mb-2 flex items-center justify-center text-xs text-muted-foreground">
                  {card.name?.substring(0, 20)}...
                </div>
                <div className="text-sm font-medium truncate w-full">{card.name}</div>
                <div className="text-xs text-muted-foreground">
                  TCG ID: {card.tcgplayerId}
                </div>
              </Button>
            ))}
          </div>

          {!loading && suggestions.length === 0 && normalizedName && (
            <div className="text-center py-8 text-muted-foreground">
              No matches found for "{name}"
            </div>
          )}
        </div>

        {/* Selected Card Preview */}
        {picked && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Selected Card</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ChosenPricePanel 
                card={picked} 
                printing={printing} 
                conditionCsv={conditionCsv}
                referencePrice={referencePrice}
              />
              
              {/* Quantity and Add to Batch */}
              <div className="flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Label htmlFor="quantity">Quantity:</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    max="999"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20"
                  />
                </div>
                
                <Button 
                  onClick={addToBatch}
                  disabled={saving || !chosenVariant}
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add to Batch
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}

function ChosenPricePanel({ 
  card, 
  printing, 
  conditionCsv,
  referencePrice 
}: { 
  card: JustTCGCard; 
  printing: Printing; 
  conditionCsv: string;
  referencePrice?: number | null;
}) {
  const condition = conditionCsv.split(',')[0]?.trim() || 'NM';

  return (
    <div className="space-y-2">
      <div><span className="text-muted-foreground">Name:</span> {card.name}</div>
      <div><span className="text-muted-foreground">TCG Player ID:</span> {card.tcgplayerId || '—'}</div>
      <div><span className="text-muted-foreground">Printing:</span> {printing}</div>
      <div><span className="text-muted-foreground">Condition:</span> {condition}</div>
      <div><span className="text-muted-foreground">Reference Price:</span> {
        referencePrice != null ? `$${Number(referencePrice).toFixed(2)}` : '—'
      }</div>
      <div className="mt-4 pt-4 border-t">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="our-price">Our Price</Label>
            <Input id="our-price" placeholder="$0.00" />
          </div>
          <div>
            <Label htmlFor="our-cost">Our Cost</Label>
            <Input id="our-cost" placeholder="$0.00" />
          </div>
        </div>
      </div>
    </div>
  );
}