import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus } from 'lucide-react';
import { useExternalGames, useExternalSets, useExternalCardSearch, useExternalCardPrices, useExternalRealtime, useExternalRarities } from '@/hooks/useExternalTCG';
import { ExternalCard } from '@/integrations/supabase/tcgLjyClient';
import { toast } from 'sonner';

interface RawCardSearchProps {
  onCardSelect: (card: ExternalCard & { price_display?: string }) => void;
  className?: string;
}

export function RawCardSearch({ onCardSelect, className = '' }: RawCardSearchProps) {
  // Search inputs
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [debouncedCardName, setDebouncedCardName] = useState('');
  
  // Filters
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<string>('');
  
  // UI state
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;
  
  // Debounce card name input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCardName(cardName);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [cardName]);
  
  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedCardName, selectedGameId, selectedSetId, selectedRarity]);
  
  // Clear set when game changes
  useEffect(() => {
    setSelectedSetId('');
  }, [selectedGameId]);
  
  // Data queries
  const { data: games = [], isLoading: gamesLoading } = useExternalGames();
  const { data: sets = [], isLoading: setsLoading } = useExternalSets(selectedGameId);
  const { data: rarities = [] } = useExternalRarities(selectedGameId);
  
  // Search suggestions (top 5)
  const { data: suggestionsData } = useExternalCardSearch(debouncedCardName, {
    gameId: selectedGameId || undefined,
    setId: selectedSetId || undefined,
    rarity: selectedRarity || undefined,
    page: 1,
    pageSize: 5,
  });
  
  // Full search results
  const { data: resultsData, isLoading: resultsLoading } = useExternalCardSearch(
    showAllResults ? debouncedCardName : '',
    {
      gameId: selectedGameId || undefined,
      setId: selectedSetId || undefined,
      rarity: selectedRarity || undefined,
      page: currentPage,
      pageSize,
    }
  );
  
  // Filter suggestions and results by card number (client-side)
  const filteredSuggestions = useMemo(() => {
    if (!suggestionsData?.cards) return [];
    
    let filtered = suggestionsData.cards;
    if (cardNumber.trim()) {
      filtered = filtered.filter(card => 
        card.number?.toLowerCase().includes(cardNumber.toLowerCase())
      );
    }
    
    return filtered.slice(0, 5);
  }, [suggestionsData?.cards, cardNumber]);
  
  const filteredResults = useMemo(() => {
    if (!resultsData?.cards) return [];
    
    if (cardNumber.trim()) {
      return resultsData.cards.filter(card => 
        card.number?.toLowerCase().includes(cardNumber.toLowerCase())
      );
    }
    
    return resultsData.cards;
  }, [resultsData?.cards, cardNumber]);
  
  // Get card IDs for pricing
  const visibleCardIds = useMemo(() => {
    const suggestionIds = filteredSuggestions.map(c => c.id);
    const resultIds = filteredResults.map(c => c.id);
    return [...new Set([...suggestionIds, ...resultIds])];
  }, [filteredSuggestions, filteredResults]);
  
  // Fetch prices for visible cards
  const { data: priceMap = {} } = useExternalCardPrices(visibleCardIds);
  
  // Set up realtime subscriptions
  useExternalRealtime(visibleCardIds, visibleCardIds.length > 0);
  
  // Format price for display
  const formatPrice = useCallback((cardId: string) => {
    const price = priceMap[cardId];
    if (!price?.price_cents) return 'No price';
    
    const dollars = price.price_cents / 100;
    return `$${dollars.toFixed(2)}`;
  }, [priceMap]);
  
  // Handle card selection
  const handleCardSelect = useCallback((card: ExternalCard) => {
    const cardWithPrice = {
      ...card,
      price_display: formatPrice(card.id),
    };
    
    onCardSelect(cardWithPrice);
    setShowSuggestions(false);
    setShowAllResults(false);
    
    toast.success(`Selected: ${card.name}${card.number ? ` #${card.number}` : ''}`);
  }, [onCardSelect, formatPrice]);
  
  // Handle search all
  const handleSearchAll = useCallback(() => {
    if (!debouncedCardName || debouncedCardName.length < 2) {
      toast.error('Enter at least 2 characters');
      return;
    }
    
    setShowAllResults(true);
    setShowSuggestions(false);
    setCurrentPage(1);
  }, [debouncedCardName]);
  
  // Handle input focus/blur for suggestions
  const handleCardNameFocus = useCallback(() => {
    if (filteredSuggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [filteredSuggestions.length]);
  
  const handleCardNameBlur = useCallback(() => {
    // Delay hiding to allow click on suggestions
    setTimeout(() => setShowSuggestions(false), 150);
  }, []);
  
  // Card tile component
  const CardTile = ({ card, isSmall = false }: { card: ExternalCard; isSmall?: boolean }) => (
    <Card 
      className={`cursor-pointer hover:bg-accent transition-colors ${isSmall ? 'p-2' : 'p-3'}`}
      onClick={() => handleCardSelect(card)}
    >
      <div className={`flex gap-3 ${isSmall ? 'items-center' : ''}`}>
        <img
          src={card.image_url || '/placeholder.svg'}
          alt={card.name}
          className={`${isSmall ? 'w-12 h-12' : 'w-16 h-20'} object-cover rounded flex-shrink-0`}
          onError={(e) => {
            (e.target as HTMLImageElement).src = '/placeholder.svg';
          }}
        />
        <div className="flex-1 min-w-0">
          <div className={`font-medium truncate ${isSmall ? 'text-sm' : ''}`}>
            {card.name}
          </div>
          <div className={`text-muted-foreground truncate ${isSmall ? 'text-xs' : 'text-sm'}`}>
            {card.set_name} • {card.game_name}
          </div>
          {card.number && (
            <div className={`text-muted-foreground ${isSmall ? 'text-xs' : 'text-sm'}`}>
              #{card.number}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            {card.rarity && (
              <Badge variant="secondary" className={isSmall ? 'text-xs px-1' : ''}>
                {card.rarity}
              </Badge>
            )}
            <span className={`font-medium ${isSmall ? 'text-xs' : 'text-sm'}`}>
              {formatPrice(card.id)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
  
  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Raw Card Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 relative">
              <Label htmlFor="cardName">Card Name</Label>
              <Input
                id="cardName"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                onFocus={handleCardNameFocus}
                onBlur={handleCardNameBlur}
                placeholder="Enter card name..."
                className="w-full"
              />
              
              {/* Typeahead Suggestions */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-64 overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {filteredSuggestions.map((card) => (
                      <CardTile key={card.id} card={card} isSmall />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cardNumber">Card Number (Optional)</Label>
              <Input
                id="cardNumber"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder="e.g. 25, 192/182"
                className="w-full"
              />
            </div>
          </div>
          
          {/* Filters */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Game</Label>
              <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Games" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Games</SelectItem>
                  {gamesLoading ? (
                    <SelectItem value="" disabled>Loading...</SelectItem>
                  ) : (
                    games.map((game) => (
                      <SelectItem key={game.id} value={game.id}>
                        {game.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Set</Label>
              <Select value={selectedSetId} onValueChange={setSelectedSetId}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sets" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Sets</SelectItem>
                  {setsLoading ? (
                    <SelectItem value="" disabled>Loading...</SelectItem>
                  ) : (
                    sets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Rarity</Label>
              <Select value={selectedRarity} onValueChange={setSelectedRarity}>
                <SelectTrigger>
                  <SelectValue placeholder="All Rarities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Rarities</SelectItem>
                  {rarities.map((rarity) => (
                    <SelectItem key={rarity} value={rarity}>
                      {rarity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Search All Button */}
          <Button 
            onClick={handleSearchAll} 
            disabled={!debouncedCardName || debouncedCardName.length < 2}
            className="w-full"
          >
            <Search className="h-4 w-4 mr-2" />
            Search All
          </Button>
          
          {/* Search Results */}
          {showAllResults && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Search Results
                  {resultsData?.totalCount && ` (${resultsData.totalCount} total)`}
                </h3>
              </div>
              
              {resultsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-24" />
                  ))}
                </div>
              ) : filteredResults.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredResults.map((card) => (
                      <CardTile key={card.id} card={card} />
                    ))}
                  </div>
                  
                  {/* Load More Button */}
                  {resultsData && filteredResults.length < resultsData.totalCount && (
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="w-full"
                    >
                      Load More ({filteredResults.length} of {resultsData.totalCount})
                    </Button>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No cards found matching your criteria
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}