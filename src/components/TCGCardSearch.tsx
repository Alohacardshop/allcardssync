import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { tcgSupabase, SearchResult } from "@/lib/tcg-supabase";
import { useGames, useCardSearch, fetchCardPricing } from "@/hooks/useTCGData";
import { toast } from "sonner";
import { Search, DollarSign, RefreshCw, Eye, Check } from "lucide-react";

interface TCGCard {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  rarity?: string;
  image_url?: string;
  rank: number;
}

interface Game {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  description?: string;
}

interface PricingVariant {
  condition: string;
  printing: string;
  price_cents: number;
  market_price_cents?: number;
  last_updated: string;
}

interface TCGCardSearchProps {
  onCardSelect?: (card: TCGCard & { selectedPrice?: number; selectedCondition?: string; selectedPrinting?: string }) => void;
  showSelectButton?: boolean;
  defaultGameSlug?: string;
  onGameChange?: (gameSlug: string) => void;
}

const CONDITIONS = [
  'mint', 'near_mint', 'lightly_played', 'light_played', 'moderately_played', 
  'played', 'heavily_played', 'poor', 'damaged', 'good', 'excellent'
];

const PRINTINGS = [
  'normal', 'foil', 'holo', 'reverse_holo', 'etched', 'borderless', 
  'extended', 'showcase', 'promo', 'first_edition'
];

export function TCGCardSearch({ onCardSelect, showSelectButton = false, defaultGameSlug = "pokemon", onGameChange }: TCGCardSearchProps) {
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [selectedGame, setSelectedGame] = useState<string>(defaultGameSlug);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  
  // Typeahead states
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Helper function to get search query (primarily card name)
  const getCombinedQuery = useCallback(() => {
    const namePart = cardName.trim().toLowerCase();
    // Only use card name for the main search, we'll filter by number client-side
    return namePart;
  }, [cardName]);

  // Selected card and pricing states
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null);
  const [pricing, setPricing] = useState<PricingVariant[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<string>("near_mint");
  const [selectedPrinting, setSelectedPrinting] = useState<string>("normal");

  // Use our new hooks with filtered results
  const { data: games = [] } = useGames();
  const { data: searchResults = [], isLoading } = useCardSearch(debouncedQuery, selectedGame === "all" ? undefined : selectedGame);
  const { data: suggestions = [] } = useCardSearch(
    getCombinedQuery().length >= 2 ? getCombinedQuery() : '', 
    selectedGame === "all" ? undefined : selectedGame, 
    undefined, 
    5
  );

  // Filter search results by card number client-side and limit to top 5
  const filteredSearchResults = useMemo(() => {
    let results = searchResults;
    
    if (cardNumber.trim()) {
      const numberFilter = cardNumber.trim().toLowerCase();
      results = searchResults.filter(card => {
        // Check if the card has a number field and if it matches
        const cardId = card.id?.toLowerCase() || '';
        const cardName = card.name?.toLowerCase() || '';
        
        // Match against card number patterns (supports partial matches)
        return cardId.includes(numberFilter) || 
               cardName.includes(numberFilter) ||
               (card as any).number?.toString().toLowerCase().includes(numberFilter);
      });
    }
    
    // Limit to top 5 results
    return results.slice(0, 5);
  }, [searchResults, cardNumber]);

  // Also filter suggestions by number
  const filteredSuggestions = useMemo(() => {
    if (!cardNumber.trim()) return suggestions;
    
    const numberFilter = cardNumber.trim().toLowerCase();
    return suggestions.filter(card => {
      const cardId = card.id?.toLowerCase() || '';
      const cardName = card.name?.toLowerCase() || '';
      
      return cardId.includes(numberFilter) || 
             cardName.includes(numberFilter) ||
             (card as any).number?.toString().toLowerCase().includes(numberFilter);
    });
  }, [suggestions, cardNumber]);

  // Update debounced query
  useEffect(() => {
    const combinedQuery = getCombinedQuery();
    const timer = setTimeout(() => {
      setDebouncedQuery(combinedQuery);
    }, 350);

    return () => clearTimeout(timer);
  }, [cardName, cardNumber, getCombinedQuery]);

  // Update suggestions display
  useEffect(() => {
    if (filteredSuggestions.length > 0 && getCombinedQuery().length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [filteredSuggestions, getCombinedQuery]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCards = async () => {
    const combinedQuery = getCombinedQuery();
    if (!combinedQuery.trim()) {
      toast.error("Please enter a card name or number");
      return;
    }
    // Search results are handled by the hook, just show success message
    if (filteredSearchResults.length === 0) {
      toast.info("No cards found for your search");
    } else {
      toast.success(`Found ${filteredSearchResults.length} cards`);
    }
  };

  const fetchPricing = async (card: TCGCard, refresh = false) => {
    setSelectedCard(card);
    setPricingLoading(true);
    setPricing([]);

    try {
      const pricingData = await fetchCardPricing(card.id, selectedCondition, selectedPrinting, refresh);
      setPricing(pricingData.variants || []);
      if (refresh) {
        toast.success("Pricing data refreshed");
      }
    } catch (e: any) {
      console.error('Pricing error:', e);
      toast.error('Failed to fetch pricing: ' + e.message);
      setPricing([]);
    } finally {
      setPricingLoading(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleCardSelect = (card: TCGCard, selectedPrice?: number) => {
    if (onCardSelect) {
      onCardSelect({ 
        ...card, 
        selectedPrice,
        selectedCondition,
        selectedPrinting
      });
    }
    toast.success(`Selected ${card.name}`);
    // Clear selected card to hide inline pricing panel
    setSelectedCard(null);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (card: TCGCard) => {
    setSelectedCard(card);
    setCardName(card.name);
    setCardNumber('');
    setShowSuggestions(false);
    setPricing([]);
    // Auto-fetch pricing with default condition
    fetchPricing(card, false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            TCG Card Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 relative space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Card name (e.g., Charizard, Lightning Bolt)"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchCards()}
                  onFocus={() => {
                    if (suggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                />
                <Input
                  placeholder="Card number (e.g., 4, 192/102)"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchCards()}
                />
              </div>
              
              {/* Typeahead Suggestions Dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-80 overflow-y-auto">
                  <div className="py-1">
                    {filteredSuggestions.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handleSuggestionSelect(card)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                      >
                        {card.image_url && (
                          <img
                            src={card.image_url}
                            alt={card.name}
                            className="w-8 h-10 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder.svg';
                            }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{card.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {card.set_name} • {card.game_name}
                          </div>
                          {card.rarity && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {card.rarity}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Select value={selectedGame} onValueChange={(value) => {
              setSelectedGame(value);
              onGameChange?.(value);
            }}>
              <SelectTrigger>
                <SelectValue placeholder="All Games" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                {games.map((game) => (
                  <SelectItem key={game.slug} value={game.slug}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={searchCards} variant="outline" size="sm">
              <Search className="h-4 w-4 mr-2" />
              Search All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Inline Pricing Panel */}
      {selectedCard && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {selectedCard.name} - Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Select value={selectedCondition} onValueChange={setSelectedCondition}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((condition) => (
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
                <SelectContent>
                  {PRINTINGS.map((printing) => (
                    <SelectItem key={printing} value={printing}>
                      {printing.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                onClick={() => fetchPricing(selectedCard, false)}
                disabled={pricingLoading}
                variant="outline"
              >
                <DollarSign className={`h-4 w-4 mr-2`} />
                Get Pricing
              </Button>
              
              <Button 
                onClick={() => fetchPricing(selectedCard, true)}
                disabled={pricingLoading}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${pricingLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {pricingLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {pricing.length === 0 ? (
                  <Alert>
                    <AlertDescription>
                      No pricing data available for this card and condition.
                    </AlertDescription>
                  </Alert>
                ) : (
                  pricing
                    .filter(variant => !selectedPrinting || selectedPrinting === 'normal' || variant.printing === selectedPrinting)
                    .map((variant, index) => (
                      <div key={`${variant.condition}-${variant.printing}-${index}`} className="border rounded-lg p-4">
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
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-muted-foreground">
                            Updated: {new Date(variant.last_updated).toLocaleDateString()}
                          </div>
                          {showSelectButton && (
                            <Button
                              size="sm"
                              onClick={() => handleCardSelect(selectedCard!, variant.price_cents)}
                              className="text-xs ml-2"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Select This Price
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {(isLoading || filteredSearchResults.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({filteredSearchResults.length} cards found)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              ) : (
                filteredSearchResults.map((card) => (
                  <div key={card.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {card.image_url && (
                        <img
                          src={card.image_url}
                          alt={card.name}
                          className="w-16 h-20 object-cover rounded flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg';
                          }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1 line-clamp-2">{card.name}</div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {card.set_name} • {card.game_name}
                        </div>
                        {card.rarity && (
                          <Badge variant="outline" className="text-xs mb-2">
                            {card.rarity}
                          </Badge>
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchPricing(card)}
                            className="text-xs"
                          >
                            <DollarSign className="h-3 w-3 mr-1" />
                            Get Pricing
                          </Button>
                          {showSelectButton && (
                            <Button
                              size="sm"
                              onClick={() => handleCardSelect(card)}
                              className="text-xs"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Select
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}