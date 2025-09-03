import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { tcgSupabase, SearchResult } from "@/lib/tcg-supabase";
import { useGames, useCardSearch } from "@/hooks/useTCGData";
import { toast } from "sonner";
import { Search } from "lucide-react";

interface TCGCard {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  number?: string;
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

interface TCGCardSearchProps {
  onCardSelect?: (card: TCGCard) => void;
  defaultGameSlug?: string;
  onGameChange?: (gameSlug: string) => void;
}


export function TCGCardSearch({ onCardSelect, defaultGameSlug = "pokemon", onGameChange }: TCGCardSearchProps) {
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

  // Remove pricing states - will be handled in RawCardIntake

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
               card.number?.toString().toLowerCase().includes(numberFilter);
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
             card.number?.toString().toLowerCase().includes(numberFilter);
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

  // Remove pricing functionality - handled in RawCardIntake

  const handleCardSelect = (card: TCGCard) => {
    if (onCardSelect) {
      onCardSelect(card);
    }
    toast.success(`Selected ${card.name}`);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (card: TCGCard) => {
    handleCardSelect(card);
    setCardName(card.name);
    setCardNumber(card.number || '');
    setShowSuggestions(false);
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
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-y-auto">
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
                            {card.number && <span>#{card.number} • </span>}
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
              <SelectContent className="bg-popover border-border z-50">
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

      {/* Pricing handled in RawCardIntake component */}

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
                  <button
                    key={card.id}
                    onClick={() => handleCardSelect(card)}
                    className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 text-left w-full transition-colors"
                  >
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
                          {card.number && <span>#{card.number} • </span>}
                          {card.set_name} • {card.game_name}
                        </div>
                        {card.rarity && (
                          <Badge variant="outline" className="text-xs mb-2">
                            {card.rarity}
                          </Badge>
                        )}
                        <div className="text-xs text-primary font-medium">
                          Click to select card
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}