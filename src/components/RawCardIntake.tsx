import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Plus, AlertCircle, DollarSign, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { GameKey, Printing } from '@/lib/types';
import { GAME_OPTIONS } from '@/lib/types';
import { useStore } from '@/contexts/StoreContext';
import { StoreSelector } from '@/components/StoreSelector';
import { LocationSelector } from '@/components/LocationSelector';
import { TCGCardSearch } from '@/components/TCGCardSearch';
import { fetchCardPricing } from '@/hooks/useTCGData';
import { tcgSupabase, PricingData } from '@/lib/tcg-supabase';

interface CatalogCard {
  id: string;
  name: string;
  number?: string;
  set_name?: string;
  set?: { name: string };
  image_url?: string;
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

const CONDITIONS = [
  'mint', 'near_mint', 'lightly_played', 'light_played', 'moderately_played', 
  'played', 'heavily_played', 'poor', 'damaged', 'good', 'excellent'
];

const TCGDB_PRINTINGS = [
  'normal', 'foil', 'holo', 'reverse_holo', 'etched', 'borderless', 
  'extended', 'showcase', 'promo', 'first_edition'
];

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
  const [customPrice, setCustomPrice] = useState("");
  const { selectedStore, selectedLocation, availableStores, availableLocations, setSelectedLocation } = useStore();
  const [saving, setSaving] = useState(false);
  
  // Pricing states
  const [selectedCondition, setSelectedCondition] = useState<string>("near_mint");
  const [selectedPrinting, setSelectedPrinting] = useState<string>("normal");
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // Available options from pricing data
  const availableConditions = useMemo(() => {
    if (!pricingData?.variants?.length) return CONDITIONS;
    const conditions = [...new Set(pricingData.variants.map(v => v.condition))];
    return conditions.length > 0 ? conditions : CONDITIONS;
  }, [pricingData]);

  const availablePrintings = useMemo(() => {
    if (!pricingData?.variants?.length) return TCGDB_PRINTINGS;
    const printings = [...new Set(pricingData.variants.map(v => v.printing))];
    return printings.length > 0 ? printings : TCGDB_PRINTINGS;
  }, [pricingData]);

  // Auto-update selections when available options change
  useEffect(() => {
    if (!pricingData?.variants?.length) return;

    // Check if current condition is available
    const currentConditionAvailable = availableConditions.includes(selectedCondition);
    if (!currentConditionAvailable && availableConditions.length > 0) {
      setSelectedCondition(availableConditions[0]);
    }

    // Check if current printing is available
    const currentPrintingAvailable = availablePrintings.includes(selectedPrinting);
    if (!currentPrintingAvailable && availablePrintings.length > 0) {
      setSelectedPrinting(availablePrintings[0]);
    }
  }, [availableConditions, availablePrintings, selectedCondition, selectedPrinting, pricingData]);

  // Update chosen variant when condition/printing changes
  useEffect(() => {
    if (selectedCondition && selectedPrinting) {
      setChosenVariant({
        condition: selectedCondition,
        printing: selectedPrinting,
        price: chosenVariant?.price || null // Keep existing price if available
      });
    }
  }, [selectedCondition, selectedPrinting]);

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
        price: customPrice ? parseFloat(customPrice) : (chosenVariant.price || null),
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
      setCustomPrice("");
      setPricingData(null);
      
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
  const handleTCGCardSelect = async (card: any) => {
    console.log('Card picked:', card, card.number);
    
    // Fix card number extraction - handle if it's an object
    let cardNumber = card.number;
    if (typeof card.number === 'object' && card.number?.value !== undefined) {
      cardNumber = card.number.value === 'undefined' ? null : card.number.value;
    }
    
    // Convert TCG card format to CatalogCard format
    const catalogCard: CatalogCard = {
      id: card.id,
      name: card.name,
      number: cardNumber,
      set_name: card.set_name,
      set: { name: card.set_name },
      image_url: card.image_url,
      tcgplayer_product_id: undefined
    };

    setPicked(catalogCard);
    setChosenVariant(null);
    setPricingData(null);
    setCustomPrice(""); // Reset custom price
    setCost(""); // Reset cost

    const payload = {
      card: catalogCard,
      chosenVariant: null,
    };

    onPick?.(payload);

    // Auto-fetch pricing data when card is selected
    setTimeout(async () => {
      setPricingLoading(true);
      try {
        const data = await fetchCardPricing(catalogCard.id);
        setPricingData(data);
        toast.success("Pricing data loaded");
      } catch (e: any) {
        console.error('Auto-pricing error:', e);
        toast.error('Failed to load pricing data');
      } finally {
        setPricingLoading(false);
      }
    }, 100);

    if (autoSaveToBatch) {
      setTimeout(addToBatch, 100);
    }
  };

  const fetchPricingData = async (refresh = false) => {
    if (!picked) return;
    
    setPricingLoading(true);
    setPricingData(null);

    try {
      const data = await fetchCardPricing(picked.id, selectedCondition, selectedPrinting, refresh);
      setPricingData(data);
      if (refresh) {
        toast.success("Pricing data refreshed");
      }
    } catch (e: any) {
      console.error('Pricing error:', e);
      toast.error('Failed to fetch pricing: ' + e.message);
      setPricingData(null);
    } finally {
      setPricingLoading(false);
    }
  };

  const formatPrice = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined || isNaN(cents)) {
      return '$0.00';
    }
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handlePricingSelect = (variant: any) => {
    const priceInDollars = variant.price_cents ? variant.price_cents / 100 : 0;
    setChosenVariant({
      condition: variant.condition,
      printing: variant.printing,
      price: priceInDollars
    });
    setCustomPrice(priceInDollars.toFixed(2));
    toast.success(`Selected ${variant.condition} ${variant.printing} at ${formatPrice(variant.price_cents)}`);
  };

  const SelectedCardPanel = () => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          {picked?.image_url && (
            <img
              src={picked.image_url}
              alt={picked.name}
              className="w-12 h-16 object-cover rounded flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder.svg';
              }}
            />
          )}
          Selected Card
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div><span className="text-muted-foreground">Name:</span> {picked?.name}</div>
          <div><span className="text-muted-foreground">Set:</span> {picked?.set_name || picked?.set?.name || '—'}</div>
          <div><span className="text-muted-foreground">Number:</span> {picked?.number || '—'}</div>
          
          {/* Store and Location Display */}
          {selectedStore && selectedLocation ? (
            <>
              <div><span className="text-muted-foreground">Store:</span> {availableStores.find(s => s.key === selectedStore)?.name}</div>
              <div><span className="text-muted-foreground">Location:</span> {availableLocations.find(l => l.gid === selectedLocation)?.name}</div>
            </>
          ) : (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                Please select both a store and location above to add this card to your batch.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Condition & Printing Selection */}
        <div className="pt-4 border-t">
          <Label className="text-sm font-medium mb-3 block">Select Condition & Printing</Label>
          <div className="flex items-center gap-4 mb-4">
            <Select value={selectedCondition} onValueChange={setSelectedCondition}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {availableConditions.map((condition) => (
                  <SelectItem key={condition} value={condition}>
                    {condition.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedPrinting} onValueChange={setSelectedPrinting}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {availablePrintings.map((printing) => (
                  <SelectItem key={printing} value={printing}>
                    {printing.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={() => fetchPricingData(false)}
              disabled={pricingLoading}
              variant="outline"
            >
              <DollarSign className={`h-4 w-4 mr-2`} />
              Get Pricing
            </Button>
            
            <Button 
              onClick={() => fetchPricingData(true)}
              disabled={pricingLoading}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${pricingLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Pricing Display */}
          {pricingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : pricingData?.variants && pricingData.variants.length > 0 ? (
            <div className="space-y-3 mb-4">
              <Label className="text-sm font-medium">Available Prices (click to select):</Label>
              {pricingData.variants
                .filter(variant => 
                  (!selectedCondition || variant.condition === selectedCondition) &&
                  (!selectedPrinting || variant.printing === selectedPrinting)
                )
                .slice(0, 5)
                .map((variant, index) => (
                  <button
                    key={`${variant.condition}-${variant.printing}-${index}`}
                    onClick={() => handlePricingSelect(variant)}
                    className="w-full border rounded-lg p-3 hover:bg-muted/50 text-left transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Badge variant="outline" className="mr-2">
                          {variant.condition.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                        <Badge variant="secondary">
                          {variant.printing.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-lg">
                          {formatPrice(variant.price_cents)}
                        </div>
                        {variant.market_price_cents && (
                          <div className="text-sm text-muted-foreground">
                            Market: {formatPrice(variant.market_price_cents)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Updated: {new Date(variant.last_updated).toLocaleDateString()}
                    </div>
                  </button>
                ))
            }
            </div>
          ) : null}

          {/* Selected Variant Display */}
          {chosenVariant && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Selected:</Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">
                  {chosenVariant.condition.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
                <Badge variant="secondary">
                  {chosenVariant.printing.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
                {chosenVariant.price && (
                  <span className="font-semibold text-primary">
                    ${chosenVariant.price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Pricing and Cost Input */}
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium mb-3 block">Pricing & Inventory Details</Label>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="customPrice">Selling Price ($)</Label>
                <Input
                  id="customPrice"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="mt-1"
                />
                {/* Database pricing reference */}
                {chosenVariant?.price && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Database: ${chosenVariant.price.toFixed(2)}
                  </div>
                )}
              </div>
              
              <div>
                <Label htmlFor="cost">Cost per Item ($)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max="999"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="mt-1"
                />
              </div>
            </div>
            
            <Button 
              onClick={addToBatch}
              disabled={saving || !chosenVariant || !selectedStore || !selectedLocation}
              className="flex items-center gap-2 w-full"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add to Batch
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
          {/* Store and Location Selectors */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">Store Selection</Label>
              <StoreSelector className="w-full" />
              <p className="text-xs text-muted-foreground mt-1">
                Select the store first, then choose a location below
              </p>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2 block">Shopify Location</Label>
              <LocationSelector className="w-full" />
              <p className="text-xs text-muted-foreground mt-1">
                Choose the specific location where items will be added
              </p>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Raw card intake now uses our comprehensive TCG database with real-time pricing from JustTCG API.
            </AlertDescription>
          </Alert>

          <TCGCardSearch 
            onCardSelect={handleTCGCardSelect}
            defaultGameSlug={game}
            onGameChange={(gameSlug) => setGame(gameSlug as GameKey)}
          />

          {/* Selected Card Preview */}
          {picked && <SelectedCardPanel />}
        </CardContent>
      </Card>
    </div>
  );
}
