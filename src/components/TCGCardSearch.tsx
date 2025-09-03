import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, DollarSign, RefreshCw, Eye, Check } from "lucide-react";

interface TCGCard {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  rarity: string;
  image_url: string;
  rank: number;
}

interface Game {
  name: string;
  slug: string;
  is_active: boolean;
}

interface PricingVariant {
  id: string;
  condition: string;
  printing: string;
  pricing: {
    price_cents: number;
    market_price_cents: number;
    low_price_cents: number;
    high_price_cents: number;
  };
  is_available: boolean;
  last_updated: string;
  card: {
    name: string;
    image_url: string;
    set_name: string;
    game_name: string;
  };
}

interface TCGCardSearchProps {
  onCardSelect?: (card: TCGCard & { selectedPrice?: number; selectedCondition?: string; selectedPrinting?: string }) => void;
  showSelectButton?: boolean;
}

const CONDITIONS = [
  'mint', 'near_mint', 'lightly_played', 'light_played', 'moderately_played', 
  'played', 'heavily_played', 'poor', 'damaged', 'good', 'excellent'
];

const PRINTINGS = [
  'normal', 'foil', 'holo', 'reverse_holo', 'etched', 'borderless', 
  'extended', 'showcase', 'promo', 'first_edition'
];

export function TCGCardSearch({ onCardSelect, showSelectButton = false }: TCGCardSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [games, setGames] = useState<Game[]>([]);
  const [cards, setCards] = useState<TCGCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Typeahead states
  const [suggestions, setSuggestions] = useState<TCGCard[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Selected card and pricing states
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null);
  const [pricing, setPricing] = useState<PricingVariant[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<string>("near_mint");
  const [selectedPrinting, setSelectedPrinting] = useState<string>("normal");

  // Load games on mount
  useEffect(() => {
    loadGames();
  }, []);

  // Debounced search for typeahead
  const debouncedSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setSuggestionsLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke('tcg-card-search', {
          body: {
            action: 'search',
            search_query: query,
            game_slug: selectedGame === "all" ? null : selectedGame,
            limit_count: 5
          }
        });

        if (error) throw error;

        if (data.success) {
          setSuggestions(data.results);
          setShowSuggestions(true);
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error('Typeahead search error:', e);
        }
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [selectedGame]
  );

  // Debounce the search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        debouncedSearch(searchQuery);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearch]);

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

  const loadGames = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('tcg-card-search?action=games', {
        body: {}
      });

      if (error) throw error;

      if (data.success) {
        setGames(data.games);
      }
    } catch (e: any) {
      console.error('Failed to load games:', e);
    }
  };

  const searchCards = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('tcg-card-search', {
        body: {
          action: 'search',
          search_query: searchQuery,
          game_slug: selectedGame === "all" ? null : selectedGame,
          limit_count: 20
        }
      });

      if (error) throw error;

      if (data.success) {
        setCards(data.results);
        if (data.results.length === 0) {
          toast.info("No cards found for your search");
        }
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (e: any) {
      console.error('Search error:', e);
      setError(e.message || 'Failed to search cards');
      toast.error('Search failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async (card: TCGCard, refresh = false) => {
    setSelectedCard(card);
    setPricingLoading(true);
    setPricing([]);

    try {
      const { data, error } = await supabase.functions.invoke('tcg-card-search?action=pricing', {
        body: {
          cardId: card.id,
          condition: selectedCondition,
          refresh
        }
      });

      if (error) throw error;

      if (data.success) {
        setPricing(data.variants || []);
        if (data.refreshed) {
          toast.success("Pricing data refreshed");
        }
      } else {
        throw new Error(data.error || 'Pricing fetch failed');
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
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (card: TCGCard) => {
    setSelectedCard(card);
    setSearchQuery(card.name);
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
            <div className="md:col-span-2 relative">
              <Input
                ref={inputRef}
                placeholder="Search for cards (e.g., Lightning Bolt, Charizard)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCards()}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
              />
              
              {/* Typeahead Suggestions Dropdown */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border rounded-md shadow-lg max-h-80 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Searching...</span>
                      </div>
                    </div>
                  ) : suggestions.length > 0 ? (
                    <div className="py-1">
                      {suggestions.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => handleSuggestionSelect(card)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left"
                        >
                          <img
                            src={card.image_url}
                            alt={card.name}
                            className="w-8 h-10 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/placeholder.svg';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{card.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {card.set_name} • {card.game_name}
                            </div>
                            <Badge variant="outline" className="text-xs mt-1">
                              {card.rarity}
                            </Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">
                      No matches found
                    </div>
                  )}
                </div>
              )}
            </div>
            <Select value={selectedGame} onValueChange={setSelectedGame}>
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
            <Button onClick={searchCards} disabled={loading} variant="outline" size="sm">
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search All
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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
                    .map((variant) => (
                      <div key={variant.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-medium">
                              {variant.condition.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} 
                              {variant.printing !== 'normal' && ` - ${variant.printing}`}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Updated: {new Date(variant.last_updated).toLocaleDateString()}
                            </div>
                          </div>
                          {showSelectButton && (
                            <Button
                              size="sm"
                              onClick={() => handleCardSelect(selectedCard, variant.pricing.market_price_cents)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Select
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>
                            <div className="text-muted-foreground">Market</div>
                            <div className="font-semibold">
                              {formatPrice(variant.pricing.market_price_cents)}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Low</div>
                            <div>{formatPrice(variant.pricing.low_price_cents)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">High</div>
                            <div>{formatPrice(variant.pricing.high_price_cents)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Price</div>
                            <div>{formatPrice(variant.pricing.price_cents)}</div>
                          </div>
                        </div>
                        {!variant.is_available && (
                          <Badge variant="secondary" className="mt-2">
                            Not Available
                          </Badge>
                        )}
                      </div>
                    ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {(loading || cards.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({cards.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-4 space-y-3">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                ))
              ) : (
                cards.map((card) => (
                  <div key={card.id} className="border rounded-lg overflow-hidden">
                    <div className="aspect-[3/4] bg-muted">
                      <img
                        src={card.image_url}
                        alt={card.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/placeholder.svg';
                        }}
                      />
                    </div>
                    <div className="p-3 space-y-2">
                      <h3 className="font-semibold text-sm truncate" title={card.name}>
                        {card.name}
                      </h3>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>{card.set_name}</div>
                        <div>{card.game_name}</div>
                        <Badge variant="outline" className="text-xs">
                          {card.rarity}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="flex-1"
                              onClick={() => fetchPricing(card)}
                            >
                              <DollarSign className="h-3 w-3 mr-1" />
                              Pricing
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{card.name} - Pricing</DialogTitle>
                            </DialogHeader>
                            
                            <div className="space-y-4">
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
                                <Button 
                                  onClick={() => fetchPricing(card, true)}
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
                                    pricing.map((variant) => (
                                      <div key={variant.id} className="border rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-2">
                                          <div>
                                            <div className="font-medium">
                                              {variant.condition.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} 
                                              {variant.printing !== 'normal' && ` - ${variant.printing}`}
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                              Updated: {new Date(variant.last_updated).toLocaleDateString()}
                                            </div>
                                          </div>
                                          {showSelectButton && (
                                            <Button
                                              size="sm"
                                              onClick={() => handleCardSelect(card, variant.pricing.market_price_cents)}
                                            >
                                              <Check className="h-3 w-3 mr-1" />
                                              Select
                                            </Button>
                                          )}
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                          <div>
                                            <div className="text-muted-foreground">Market</div>
                                            <div className="font-semibold">
                                              {formatPrice(variant.pricing.market_price_cents)}
                                            </div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Low</div>
                                            <div>{formatPrice(variant.pricing.low_price_cents)}</div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">High</div>
                                            <div>{formatPrice(variant.pricing.high_price_cents)}</div>
                                          </div>
                                          <div>
                                            <div className="text-muted-foreground">Price</div>
                                            <div>{formatPrice(variant.pricing.price_cents)}</div>
                                          </div>
                                        </div>
                                        {!variant.is_available && (
                                          <Badge variant="secondary" className="mt-2">
                                            Not Available
                                          </Badge>
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        {showSelectButton && (
                          <Button 
                            size="sm" 
                            onClick={() => handleCardSelect(card)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Select
                          </Button>
                        )}
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