import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Plus, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GameKey, Printing } from '@/lib/types';
import { GAME_OPTIONS } from '@/lib/types';
import { useStore } from '@/contexts/StoreContext';
import { AllLocationsSelector } from '@/components/AllLocationsSelector';
import { TCGCardSearch } from '@/components/TCGCardSearch';

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
  const [cost, setCost] = useState("");
  const { selectedStore, selectedLocation, availableStores, availableLocations, setSelectedLocation } = useStore();
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

    if (!selectedStore || !selectedLocation) {
      toast.error("Please select a store and location first");
      return;
    }

    setSaving(true);
    try {
      // Timeout helper function
      const withTimeout = <T,>(p: Promise<T>, ms = 12000) =>
        Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timed out')), ms))]);

      const insertPayload = {
        // Required/common fields
        store_key: selectedStore,
        shopify_location_gid: selectedLocation,
        quantity: quantity,
        product_weight: 1.0, // 1 oz for raw cards
        brand_title: picked.name,
        subject: picked.name, // Use card name as subject for raw cards
        category: mapGameToCategory(game),
        variant: chosenVariant.printing,
        card_number: picked.number || "",
        year: "", // Raw cards typically don't have year data
        grade: chosenVariant.condition,
        price: chosenVariant.price || null,
        cost: cost ? parseFloat(cost) : null,
        sku: generateSKU(picked, chosenVariant, game),

        // Identity
        unique_item_uid: crypto.randomUUID(), // NEW column (UUID)

        // Raw card specific fields
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
        processing_notes: `Raw card intake search for "${name}" in ${game}`
      };

      const insertResponse: any = await withTimeout(
        (async () => await supabase.from('intake_items').insert(insertPayload).select('*').single())()
      );

      if (insertResponse.error) throw insertResponse.error;
      const data = insertResponse.data;

      // Dispatch browser event for real-time updates
      window.dispatchEvent(new CustomEvent('intake:item-added', { detail: data }));
      toast.success(`Added to batch (Lot ${data?.lot_number ?? ''})`);
      
      // Reset selection but keep search results
      setPicked(null);
      setChosenVariant(null);
      setQuantity(1);
      setCost("");
      
      // Call onBatchAdd if provided
      if (onBatchAdd) {
        onBatchAdd(data);
      }
    } catch (error) {
      console.error('Error adding to batch:', error);
      if (error?.message?.includes('timed out')) {
        toast.error('Request timed out - please try again');
      } else {
        toast.error('Failed to add item to batch');
      }
    } finally {
      setSaving(false);
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

  // Handle card selection from TCG search
  const handleTCGCardSelect = (card: any) => {
    // Convert TCG card format to CatalogCard format
    const catalogCard: CatalogCard = {
      id: card.id,
      name: card.name,
      set: { name: card.set_name },
      tcgplayer_product_id: undefined
    };

    // Use selected condition and printing from TCG search, or fallback to current values
    const selectedCondition = card.selectedCondition || conditionCsv.split(',')[0]?.trim() || 'NM';
    const selectedPrinting = card.selectedPrinting || printing;

    const chosenVar = {
      condition: selectedCondition,
      printing: selectedPrinting,
      price: card.selectedPrice ? card.selectedPrice / 100 : null // Convert from cents
    };

    setPicked(catalogCard);
    setChosenVariant(chosenVar);

    const payload = {
      card: catalogCard,
      chosenVariant: chosenVar,
    };

    onPick?.(payload);

    if (autoSaveToBatch && chosenVar) {
      setTimeout(addToBatch, 100);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Raw Cards Intake
          </CardTitle>
          <p className="text-sm text-muted-foreground">Add raw (ungraded) cards to inventory</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Location Selector */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Shopify Location</Label>
            <AllLocationsSelector
              value={selectedLocation || ""}
              onValueChange={setSelectedLocation}
              placeholder="Select location for intake"
              className="w-full"
            />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Raw card intake now uses our comprehensive TCG database with real-time pricing from JustTCG API.
            </AlertDescription>
          </Alert>

          <TCGCardSearch 
            onCardSelect={handleTCGCardSelect}
            showSelectButton={true}
            defaultGameSlug={game}
            onGameChange={(gameSlug) => setGame(gameSlug as GameKey)}
          />

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
                   <div><span className="text-muted-foreground">Printing:</span> {chosenVariant?.printing || printing}</div>
                   <div><span className="text-muted-foreground">Condition:</span> {chosenVariant?.condition || conditionCsv.split(',')[0]?.trim() || 'NM'}</div>
                  {chosenVariant?.price && (
                    <div><span className="text-muted-foreground">Market Price:</span> ${chosenVariant.price.toFixed(2)}</div>
                  )}
                  {selectedStore && selectedLocation && (
                    <>
                      <div><span className="text-muted-foreground">Store:</span> {availableStores.find(s => s.key === selectedStore)?.name}</div>
                      <div><span className="text-muted-foreground">Location:</span> {availableLocations.find(l => l.gid === selectedLocation)?.name}</div>
                    </>
                  )}
                </div>
                
                {/* Cost, Quantity and Add to Batch */}
                <div className="flex items-center gap-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cost">Cost each ($):</Label>
                    <Input
                      id="cost"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="w-24"
                    />
                  </div>

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
                    disabled={saving || !chosenVariant || !selectedStore || !selectedLocation}
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
    </div>
  );
}
