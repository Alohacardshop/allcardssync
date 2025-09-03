import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { tcgSupabase, PricingResponse, PricingData, updateVariantPricing, getVariantPricing, formatPrice as tcgFormatPrice, findVariant, fetchCardVariants, getJustTCGCardId, proxyPricing } from '@/lib/tcg-supabase';
import { generateSKU as generateSkuFromVariant } from '@/lib/sku';

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

// Constants - Standardized options
const STANDARD_CONDITIONS = [
  { value: 'sealed', label: 'Sealed' },
  { value: 'near_mint', label: 'Near Mint' },
  { value: 'lightly_played', label: 'Lightly Played' },
  { value: 'moderately_played', label: 'Moderately Played' },
  { value: 'heavily_played', label: 'Heavily Played' },
  { value: 'damaged', label: 'Damaged' }
];

const STANDARD_PRINTINGS = [
  { value: 'normal', label: 'Normal' },
  { value: 'foil', label: 'Foil' }
];

// Helper function to normalize condition from API abbreviations
const normalizeCondition = (condition: string): string => {
  const normalized = condition.toLowerCase().trim();
  const conditionMap: { [key: string]: string } = {
    's': 'sealed',
    'nm': 'near_mint',
    'lp': 'lightly_played', 
    'mp': 'moderately_played',
    'hp': 'heavily_played',
    'dmg': 'damaged',
    'damaged': 'damaged',
    'mint': 'near_mint' // Map mint to near_mint
  };
  return conditionMap[normalized] || normalized;
};

// Helper function to normalize printing
const normalizePrinting = (printing: string): string => {
  const normalized = printing.toLowerCase().trim();
  return normalized === 'foil' ? 'foil' : 'normal';
};

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
  const [justtcgCardId, setJusttcgCardId] = useState<string | null>(null);
  const [chosenVariant, setChosenVariant] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [cost, setCost] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const { selectedStore, selectedLocation, availableStores, availableLocations, setSelectedLocation } = useStore();
  const [saving, setSaving] = useState(false);
  
  // Pricing states
  const [selectedCondition, setSelectedCondition] = useState<string>("near_mint");
  const [selectedPrinting, setSelectedPrinting] = useState<string>("normal");
  const [pricingData, setPricingData] = useState<PricingResponse | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [lastPricingRequest, setLastPricingRequest] = useState<any>(null);
  const [showPricingDebug, setShowPricingDebug] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Card variant data from TCG DB
  const [cardVariants, setCardVariants] = useState<{conditions: string[], printings: string[]} | null>(null);

  // Refs for input focus management
  const costInputRef = useRef<HTMLInputElement>(null);

  // Available options - always show standardized conditions and filtering printings based on card data
  const availableConditions = useMemo(() => {
    // Always return the standardized condition values
    return STANDARD_CONDITIONS.map(c => c.value);
  }, []);

  const availablePrintings = useMemo(() => {
    // First try pricing data variants
    if (pricingData?.variants?.length) {
      const printings = [...new Set(pricingData.variants.map(v => normalizePrinting(v.printing)))];
      if (printings.length > 0) return printings;
    }
    
    // Fallback to card variants from TCG DB
    if (cardVariants?.printings?.length) {
      const normalizedPrintings = [...new Set(cardVariants.printings.map(p => normalizePrinting(p)))];
      if (normalizedPrintings.length > 0) return normalizedPrintings;
    }
    
    // Default to just normal printing if no card is picked or no data
    return ['normal'];
  }, [pricingData, cardVariants]);

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
        price: chosenVariant?.price || null, // Keep existing price if available
        variant_id: chosenVariant?.variant_id || null // Keep variant ID if available
      });
    }
  }, [selectedCondition, selectedPrinting]);

  // Auto-populate selling price from TCG price (rounded UP) when pricing data loads
  useEffect(() => {
    if (!pricingData?.variants?.length) return;
    const v: any = findVariant(pricingData as any, selectedCondition, selectedPrinting) || pricingData.variants[0];
    if (!v) return;
    const priceCents = v.pricing?.price_cents ?? v.price_cents;
    const priceInDollars = priceCents ? priceCents / 100 : 0;
    const roundedUp = priceInDollars > 0 ? Math.ceil(priceInDollars) : 0;
    setChosenVariant({
      condition: v.condition,
      printing: v.printing,
      price: priceInDollars,
      variant_id: v.id || null,
    });
    setCustomPrice(roundedUp > 0 ? String(roundedUp) : "");
  }, [pricingData, selectedCondition, selectedPrinting]);

  const debounceRef = useRef<NodeJS.Timeout>();

  // Check if user is admin
  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: adminCheck } = await supabase.rpc("has_role", { 
            _user_id: session.user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(adminCheck));
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
        setIsAdmin(false);
      }
    };
    checkAdminRole();
  }, []);

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
    return generateSkuFromVariant(game, variant?.variant_id, 'CARD', card.id);
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
      // Enhanced timeout helper with retry
      const withTimeoutAndRetry = async <T,>(
        fn: () => Promise<T>, 
        timeoutMs = 20000, 
        retryCount = 1
      ): Promise<T> => {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
          try {
            return await Promise.race([
              fn(),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
              )
            ]);
          } catch (error: any) {
            if (attempt === retryCount) throw error;
            if (error?.message?.includes('timed out')) {
              console.log(`Attempt ${attempt + 1} timed out, retrying...`);
              continue;
            }
            throw error; // Non-timeout error, don't retry
          }
        }
        throw new Error('All retry attempts failed');
      };

      // Use the new RPC with minimal payload
      const rpcParams = {
        store_key_in: selectedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: quantity,
        brand_title_in: picked.name,
        subject_in: picked.name,
        category_in: mapGameToCategory(game),
        variant_in: chosenVariant.printing,
        card_number_in: picked.number || "",
        grade_in: chosenVariant.condition,
        price_in: customPrice ? parseFloat(customPrice) : (chosenVariant.price || 0),
        cost_in: cost ? (isNaN(parseFloat(cost)) ? null : parseFloat(cost)) : null,
        sku_in: generateSKU(picked, chosenVariant, game),
        source_provider_in: 'raw_search',
        catalog_snapshot_in: {
          card_id: picked.id,
          tcgplayer_id: picked.tcgplayer_product_id,
          name: picked.name,
          set: picked.set?.name,
          number: picked.number
        },
        pricing_snapshot_in: {
          price: chosenVariant.price,
          condition: chosenVariant.condition,
          printing: chosenVariant.printing,
          variant_id: chosenVariant.variant_id || null,
          captured_at: new Date().toISOString(),
          pricing_data: pricingData ? {
            cardId: pricingData.cardId,
            variant_count: pricingData.variants?.length || 0
          } : null
        },
        processing_notes_in: `Raw card intake search for "${name}" in ${game}`
      };

      const response: any = await withTimeoutAndRetry(
        async () => await supabase.rpc('create_raw_intake_item', rpcParams)
      );

      if (response.error) {
        // Enhanced error handling
        console.error('RPC Error:', response.error);
        if (response.error.code === 'PGRST116') {
          throw new Error('Access denied - please check your permissions');
        } else if (response.error.message?.includes('store_key') || response.error.message?.includes('location')) {
          throw new Error('Invalid store or location selection');
        }
        throw response.error;
      }

      const responseData = Array.isArray(response.data) ? response.data[0] : response.data;

      // Show warning if price was saved as 0
      const finalPrice = customPrice ? parseFloat(customPrice) : (chosenVariant.price || 0);
      if (finalPrice === 0) {
        toast.warning(`Added to batch with $0.00 price - please review pricing`, {
          duration: 5000
        });
      } else {
        toast.success(`Added to batch (Lot ${responseData?.lot_number ?? ''})`);
      }

      // Dispatch browser event for real-time updates
      window.dispatchEvent(new CustomEvent('intake:item-added', { 
        detail: { ...responseData, lot_number: responseData?.lot_number }
      }));
      
      // Reset selection but keep search results
      setPicked(null);
      setJusttcgCardId(null);
      setChosenVariant(null);
      setQuantity(1);
      setCost("");
      setCustomPrice("");
      setPricingData(null);
      
      // Call onBatchAdd if provided
      if (onBatchAdd) {
        onBatchAdd(responseData);
      }
    } catch (error: any) {
      console.error('Error adding to batch:', error);
      const errorMessage = error?.message || 'Unknown error';
      
      if (errorMessage.includes('timed out')) {
        toast.error('Request timed out - please try again');
      } else if (errorMessage.includes('Access denied')) {
        toast.error('Access denied - please check your permissions');
      } else if (errorMessage.includes('store') || errorMessage.includes('location')) {
        toast.error('Please select a valid store and location');
      } else {
        toast.error(`Failed to add item: ${errorMessage}`);
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

    // Fetch JustTCG card ID first
    setTimeout(async () => {
      try {
        const { getJustTCGCardId } = await import('@/lib/tcg-supabase');
        const justtcgId = await getJustTCGCardId(catalogCard.id);
        if (justtcgId) {
          setJusttcgCardId(justtcgId);
          console.log('JustTCG card ID found:', justtcgId);
        } else {
          console.log('No JustTCG card ID found for card:', catalogCard.id);
          setJusttcgCardId(null);
        }
      } catch (e: any) {
        console.error('Failed to fetch JustTCG card ID:', e);
        setJusttcgCardId(null);
      }
    }, 10);

    const payload = {
      card: catalogCard,
      chosenVariant: null,
    };

    onPick?.(payload);

    // Auto-fetch pricing data when card is selected (after JustTCG ID is set)
    setTimeout(async () => {
      setPricingLoading(true);
      try {
        const data = await fetchCardPricing(catalogCard.id);
        setPricingData(data);
        if (data.success && data.variants.length > 0) {
          toast.success("Pricing data loaded");
        } else {
          console.log('No pricing variants found for card:', catalogCard.id);
          // Don't show error toast for "no pricing found" - this is normal
        }
      } catch (e: any) {
        console.error('Auto-pricing error:', e);
        toast.error('Failed to load pricing data: ' + e.message);
      } finally {
        setPricingLoading(false);
      }
    }, 200); // Increased delay to allow JustTCG ID to be fetched

    // Also fetch card variants from TCG DB for condition/printing options
    setTimeout(async () => {
      try {
        const variants = await fetchCardVariants(catalogCard.id);
        setCardVariants(variants);
        console.log('Card variants from TCG DB:', variants);
        if (variants.conditions.length > 0 || variants.printings.length > 0) {
          console.log(`Found ${variants.conditions.length} conditions and ${variants.printings.length} printings in TCG DB`);
        }
      } catch (e: any) {
        console.error('Failed to fetch card variants:', e);
        setCardVariants(null);
      }
    }, 50);

    if (autoSaveToBatch) {
      setTimeout(addToBatch, 100);
    }
  };

  const fetchPricingData = async (refresh = false) => {
    if (!picked || !justtcgCardId) {
      toast.error('Card or JustTCG ID not available for pricing');
      return;
    }
    
    setPricingLoading(true);
    setPricingData(null);

    try {
      // Use our proxy directly with JustTCG card ID
      const { proxyPricing } = await import('@/lib/tcg-supabase');
      const data = await proxyPricing(justtcgCardId, selectedCondition, selectedPrinting, refresh);
      
      setLastPricingRequest({
        cardId: justtcgCardId,
        condition: selectedCondition,
        printing: selectedPrinting,
        refresh
      });
      
      if (data.success && data.variants.length > 0) {
        toast.success(refresh ? "Pricing data refreshed from JustTCG API" : "Pricing data loaded");
      } else {
        console.log('No pricing variants found for JustTCG card ID:', justtcgCardId);
      }
      
      setPricingData(data);
    } catch (e: any) {
      console.error('Pricing error:', e);
      toast.error('Failed to fetch pricing: ' + e.message);
      setPricingData(null);
    } finally {
      setPricingLoading(false);
    }
  };

  const formatPrice = (cents: number | null | undefined, showNoPrice = false) => {
    if (cents === null || cents === undefined || isNaN(cents) || cents === 0) {
      return showNoPrice ? 'No price' : '$0.00';
    }
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handlePricingSelect = (variant: any) => {
    // Handle both old and new pricing formats
    const priceCents = variant.pricing?.price_cents || variant.price_cents;
    const priceInDollars = priceCents && !isNaN(priceCents) ? priceCents / 100 : 0;
    
    // Round UP to nearest whole dollar for selling price
    const roundedSellingPrice = priceInDollars > 0 ? Math.ceil(priceInDollars) : 0;
    
    const newVariant = {
      condition: variant.condition,
      printing: variant.printing,
      price: priceInDollars,
      variant_id: variant.id || null // Capture variant ID
    };
    
    setChosenVariant(newVariant);
    // Set selling price to nearest whole dollar
    setCustomPrice(roundedSellingPrice > 0 ? roundedSellingPrice.toString() : "");
    
    const priceDisplay = priceCents && !isNaN(priceCents) && priceCents > 0 
      ? tcgFormatPrice(priceCents) 
      : 'No price available';
    
    toast.success(`Selected ${variant.condition} ${variant.printing} at ${priceDisplay}`);
  };

  // Memoized pricing form component to prevent unnecessary re-renders
  const PricingForm = React.memo(({ 
    customPrice, 
    setCustomPrice, 
    cost, 
    setCost, 
    quantity, 
    setQuantity, 
    chosenVariant,
    costInputRef,
    addToBatch,
    saving,
    selectedStore,
    selectedLocation
  }: {
    customPrice: string;
    setCustomPrice: (value: string) => void;
    cost: string;
    setCost: (value: string) => void;
    quantity: number;
    setQuantity: (value: number) => void;
    chosenVariant: any;
    costInputRef: React.RefObject<HTMLInputElement>;
    addToBatch: () => void;
    saving: boolean;
    selectedStore: string | null;
    selectedLocation: string | null;
  }) => {
    
    const handleCostChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      console.log('Cost input change:', e.target.value);
      setCost(e.target.value);
    }, [setCost]);

    const handleCostBlur = useCallback(() => {
      console.log('Cost input blur detected');
    }, []);

    const handleCostFocus = useCallback(() => {
      console.log('Cost input focus detected');
    }, []);

    return (
      <div className="pt-4 border-t">
        <Label className="text-sm font-medium mb-3 block">Pricing & Inventory Details</Label>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <Label htmlFor="customPrice">Selling Price ($) - Auto-filled from TCG</Label>
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
                TCG Price: ${chosenVariant.price.toFixed(2)} (Selling: ${customPrice || '0.00'})
              </div>
            )}
          </div>
         
          <div>
            <Label htmlFor="cost">Cost per Item ($)</Label>
            <Input
              ref={costInputRef}
              id="cost"
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              placeholder="0.00"
              value={cost}
              onChange={handleCostChange}
              onFocus={handleCostFocus}
              onBlur={handleCostBlur}
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
    );
  });

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
                {STANDARD_CONDITIONS.map((conditionOption) => (
                  <SelectItem key={conditionOption.value} value={conditionOption.value}>
                    {conditionOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={selectedPrinting} onValueChange={setSelectedPrinting}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {STANDARD_PRINTINGS
                  .filter(printingOption => availablePrintings.includes(printingOption.value))
                  .map((printingOption) => (
                    <SelectItem key={printingOption.value} value={printingOption.value}>
                      {printingOption.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={() => fetchPricingData(true)}
              disabled={pricingLoading}
              variant="outline"
            >
              {pricingLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Get Pricing
            </Button>
            
            {isAdmin && (
              <Button 
                onClick={() => setShowPricingDebug(!showPricingDebug)}
                variant="ghost"
              >
                Debug {showPricingDebug ? '−' : '+'}
              </Button>
            )}
          </div>

          {/* Pricing Debug Panel - Admin Only */}
          {isAdmin && showPricingDebug && (
            <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
              <h4 className="font-medium mb-2">Pricing Debug Information</h4>
              {lastPricingRequest && (
                <div className="space-y-2">
                  <div><strong>Last Request:</strong></div>
                  <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
                    {JSON.stringify({
                      ...lastPricingRequest,
                      justtcgCardId: justtcgCardId,
                      tcgDbCardId: picked?.id
                    }, null, 2)}
                  </pre>
                  {pricingData && (
                    <>
                      <div><strong>Response Summary:</strong></div>
                      <pre className="bg-background p-2 rounded text-xs overflow-x-auto">
                         {JSON.stringify({
                           cardId: pricingData.cardId,
                           variants: pricingData.variants?.map(v => ({
                             id: v.id,
                             sku: v.sku || 'N/A',
                             condition: v.condition,
                             printing: v.printing,
                             price_cents: v.pricing?.price_cents || v.price_cents
                           })) || []
                         }, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Pricing Display */}
          {pricingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : pricingData?.variants && pricingData.variants.length > 0 ? (
            <div className="space-y-3 mb-4">
              <Label className="text-sm font-medium">Available Prices:</Label>
              {pricingData.variants
                .filter(variant => 
                  (!selectedCondition || normalizeCondition(variant.condition) === selectedCondition) &&
                  (!selectedPrinting || normalizePrinting(variant.printing) === selectedPrinting)
                )
                .slice(0, 5)
                .map((variant, index) => (
                  <div
                    key={`${variant.condition}-${variant.printing}-${index}`}
                    className="w-full border rounded-lg p-3 bg-muted/20"
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
                          {formatPrice(variant.pricing?.price_cents || variant.price_cents)}
                          <div className="text-xs text-muted-foreground font-normal">
                            TCGplayer price as of yesterday
                          </div>
                        </div>
                        {(variant.pricing?.market_price_cents || variant.market_price_cents) && (
                          <div className="text-sm text-muted-foreground">
                            Market: {formatPrice(variant.pricing?.market_price_cents || variant.market_price_cents)}
                          </div>
                        )}
                      </div>
                    </div>
                     <div className="text-xs text-muted-foreground">
                       Updated: {new Date(variant.last_updated).toLocaleDateString()}
                       {variant.id && <span className="ml-2">ID: {variant.id}</span>}
                       {variant.sku && <span className="ml-2">SKU: {variant.sku}</span>}
                     </div>
                  </div>
                ))
            }
            </div>
          ) : null}

          
          <PricingForm 
            customPrice={customPrice}
            setCustomPrice={setCustomPrice}
            cost={cost}
            setCost={setCost}
            quantity={quantity}
            setQuantity={setQuantity}
            chosenVariant={chosenVariant}
            costInputRef={costInputRef}
            addToBatch={addToBatch}
            saving={saving}
            selectedStore={selectedStore}
            selectedLocation={selectedLocation}
           />
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
