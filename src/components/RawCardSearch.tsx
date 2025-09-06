import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { useExternalGames, useExternalCardSearch, useExternalCardPrices, useExternalRealtime, useExternalRarities } from '@/hooks/useExternalTCG';
import { ExternalCard } from '@/integrations/supabase/tcgLjyClient';
import { useRawIntakeSettings } from '@/hooks/useRawIntakeSettings';
import { toast } from 'sonner';

interface RawCardSearchProps {
  onCardSelect: (card: ExternalCard & { price_display?: string }) => void;
  onGameChange?: (gameId: string) => void;
  className?: string;
}

export function RawCardSearch({ onCardSelect, onGameChange, className = '' }: RawCardSearchProps) {
  // Load raw intake settings
  const { settings, loading: settingsLoading } = useRawIntakeSettings();
  
  // Search inputs
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [debouncedCardName, setDebouncedCardName] = useState('');
  
  // Filters - default to configured default game
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');

  // Set default game when settings load
  useEffect(() => {
    if (!settingsLoading && settings.defaultGame && selectedGameId === '') {
      setSelectedGameId(settings.defaultGame);
    }
  }, [settings, settingsLoading, selectedGameId]);
  
  // UI state removed - no more dropdown suggestions
  
  // Debounce card name input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCardName(cardName);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [cardName]);
  
  // Handle game changes
  useEffect(() => {
    onGameChange?.(selectedGameId);
  }, [selectedGameId, onGameChange]);
  
  // Data queries
  const { data: allGames = [], isLoading: gamesLoading } = useExternalGames();
  const { data: rarities = [] } = useExternalRarities(selectedGameId !== 'all' && selectedGameId ? selectedGameId : '');

  // Filter games based on admin settings
  const games = allGames.filter(game => settings.enabledGames.includes(game.id));
  
  // Search suggestions (top 5) - show when typing 2+ characters
  const { data: suggestionsData } = useExternalCardSearch(
    debouncedCardName.length >= 2 ? debouncedCardName : '',
    {
      gameId: selectedGameId !== 'all' && selectedGameId ? selectedGameId : undefined,
      rarity: selectedRarity !== 'all' ? selectedRarity : undefined,
      page: 1,
      pageSize: 5,
    }
  );
  
  // Filter suggestions by card number (client-side) - more flexible matching
  const filteredSuggestions = useMemo(() => {
    if (!suggestionsData?.cards) return [];
    
    let filtered = suggestionsData.cards;
    if (cardNumber.trim()) {
      // Normalize both search and card numbers by removing common separators
      const normalizeNumber = (num: string) => num.replace(/[\/\-\s]/g, '').toLowerCase();
      const searchNumber = normalizeNumber(cardNumber);
      
      filtered = filtered.filter(card => {
        if (!card.number) return false;
        const cardNum = normalizeNumber(card.number);
        return cardNum.includes(searchNumber);
      });
    }
    
    return filtered.slice(0, 5);
  }, [suggestionsData?.cards, cardNumber]);
  
  // Get card IDs for pricing
  const visibleCardIds = useMemo(() => {
    return filteredSuggestions.map(c => c.id);
  }, [filteredSuggestions]);
  
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
    
    toast.success(`Selected: ${card.name}${card.number ? ` #${card.number}` : ''}`);
  }, [onCardSelect, formatPrice]);
  
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
          {/* Game Selection */}
          <div className="space-y-2">
            <Label>Game</Label>
            <Select value={selectedGameId} onValueChange={setSelectedGameId}>
              <SelectTrigger className="bg-background border-input">
                <SelectValue placeholder="Select a game" />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                {gamesLoading ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
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

          {/* Search Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cardName">Card Name</Label>
              <Input
                id="cardName"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder="Enter card name..."
                className="w-full"
              />
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
          
          {/* Additional Filters */}
          <div className="space-y-2">
            <Label>Rarity</Label>
            <Select value={selectedRarity} onValueChange={setSelectedRarity}>
              <SelectTrigger className="bg-background border-input">
                <SelectValue placeholder="All Rarities" />
              </SelectTrigger>
              <SelectContent className="bg-background border z-50">
                <SelectItem value="all">All Rarities</SelectItem>
                {rarities.map((rarity) => (
                  <SelectItem key={rarity} value={rarity}>
                    {rarity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Search Results */}
          {debouncedCardName.length >= 2 && (
            <div className="space-y-2">
              <Label>Top 5 Results</Label>
              {filteredSuggestions.length > 0 ? (
                <div className="space-y-2">
                  {filteredSuggestions.map((card) => (
                    <CardTile key={card.id} card={card} />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm text-center py-4">
                  No cards found matching your search.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}