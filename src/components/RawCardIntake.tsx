import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GameKey, Printing } from '@/lib/types';
import { GAME_OPTIONS } from '@/lib/types';
import { useStore } from '@/contexts/StoreContext';

interface CatalogCard {
  id: string;
  name: string;
  number?: string;
  set?: { name: string };
  images?: { small?: string };
  tcgplayer_product_id?: number;
}

interface RawCardIntakeProps {
  defaultGame?: GameKey;
  defaultPrinting?: Printing;
  defaultConditions?: string;
  autoSaveToBatch?: boolean;
  onPick?: (payload: {
    card: CatalogCard;
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
  const [suggestions, setSuggestions] = useState<CatalogCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CatalogCard | null>(null);
  const [chosenVariant, setChosenVariant] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const { selectedStore, selectedLocation } = useStore();
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout>();

  // Clear suggestions when inputs change
  useEffect(() => {
    setSuggestions([]);
    setError(null);
  }, [name, number, game]);

  const doSearch = async () => {
    if (!name || name.length < 3) {
      toast.error('Enter at least 3 characters');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      try {
        // TODO: Replace with API call to alohacardshopcarddatabase
        // Legacy catalog browse function removed
        throw new Error('Catalog search functionality moved to external service');

      } catch (err: any) {
        const message = err?.message || 'Failed to search cards';
        setError(message);
        toast.error('Search Error', { description: message });
      } finally {
        setLoading(false);
      }
    }, 450);
  };

  const generateSKU = (card: CatalogCard, variant: any, game: GameKey): string => {
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
      toast.error("Please select a card and variant first");
      return;
    }

    try {
      const { error } = await supabase
        .from('intake_items')
        .insert({
          category: mapGameToCategory(game),
          brand_title: picked.name,
          variant: chosenVariant.printing,
          grade: chosenVariant.condition,
          price: chosenVariant.price,
          sku: generateSKU(picked, chosenVariant, game),
          quantity: quantity,
          // New comprehensive data capture fields
          source_provider: 'raw_search',
          source_payload: JSON.parse(JSON.stringify({
            search_query: {
              game,
              name: name,
              number: number,
              printing,
              conditions: conditionCsv
            },
            search_results: suggestions.slice(0, 5).map(s => ({
              id: s.id,
              name: s.name,
              number: s.number,
              set: s.set?.name
            })),
            selected_card: {
              id: picked.id,
              name: picked.name,
              number: picked.number,
              set: picked.set?.name
            },
            selected_variant: chosenVariant
          })),
          catalog_snapshot: {
            card_id: picked.id,
            tcgplayer_id: picked.tcgplayer_product_id,
            name: picked.name,
            set: picked.set?.name,
            number: picked.number
          },
          pricing_snapshot: {
            price: chosenVariant.price,
            condition: chosenVariant.condition,
            printing: chosenVariant.printing,
            captured_at: new Date().toISOString()
          },
          processing_notes: `Raw card intake search for "${name}" in ${game}`,
          store_key: selectedStore || null,
          shopify_location_gid: selectedLocation || null
        });

      if (error) throw error;

      toast.success(`Added ${quantity}x ${picked.name} to batch`);
      
      // Reset selection but keep search results
      setPicked(null);
      setChosenVariant(null);
      setQuantity(1);
      
      // Call onBatchAdd if provided
      if (onBatchAdd) {
        onBatchAdd({});
      }
    } catch (error) {
      console.error('Error adding to batch:', error);
      toast.error('Failed to add item to batch');
    }
  };

  const handleSuggestionClick = async (card: CatalogCard) => {
    setPicked(card);
    
    const chosenVar = {
      condition: conditionCsv.split(',')[0]?.trim() || 'NM',
      printing: printing,
      price: null
    };
    
    setChosenVariant(chosenVar);
    
    const payload = {
      card,
      chosenVariant: chosenVar,
    };

    onPick?.(payload);

    if (autoSaveToBatch && chosenVar) {
      setTimeout(addToBatch, 100);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Card Intake
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Card search now uses local catalog data only. External sync functionality has been removed.
            {/* TODO: Update message when external catalog API is integrated */}
          </AlertDescription>
        </Alert>

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
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            />
          </div>
          <div>
            <Label htmlFor="number">Card Number (Optional)</Label>
            <Input
              id="number"
              placeholder="e.g., 201/197 or 201"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
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
          <div className="flex items-center justify-between mb-3">
            <Label className="text-base font-semibold">Suggestions</Label>
            <Button 
              size="sm" 
              onClick={doSearch}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Searching...
                </>
              ) : (
                'Search'
              )}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {suggestions.map((card, index) => (
              <Button
                key={card.id || `card-${index}`}
                variant="outline"
                className="h-auto p-3 text-left flex flex-col items-start"
                onClick={() => handleSuggestionClick(card)}
              >
                <div className="w-full h-32 bg-muted rounded mb-2 flex items-center justify-center text-xs text-muted-foreground">
                  {card.name?.substring(0, 20)}...
                </div>
                <div className="text-sm font-medium truncate w-full">{card.name}</div>
                <div className="text-xs text-muted-foreground">
                  {card.set?.name} • {card.number}
                </div>
              </Button>
            ))}
          </div>

          {!loading && suggestions.length === 0 && name && name.length >= 3 && (
            <div className="text-center py-8 text-muted-foreground">
              No matches found for "{name}"
            </div>
          )}

          {!loading && suggestions.length === 0 && name && name.length < 3 && (
            <div className="text-center py-8 text-muted-foreground">
              Enter card name (3+ characters) to search
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
              <div className="space-y-2">
                <div><span className="text-muted-foreground">Name:</span> {picked.name}</div>
                <div><span className="text-muted-foreground">Set:</span> {picked.set?.name || '—'}</div>
                <div><span className="text-muted-foreground">Number:</span> {picked.number || '—'}</div>
                <div><span className="text-muted-foreground">Printing:</span> {printing}</div>
                <div><span className="text-muted-foreground">Condition:</span> {conditionCsv.split(',')[0]?.trim() || 'NM'}</div>
              </div>
              
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