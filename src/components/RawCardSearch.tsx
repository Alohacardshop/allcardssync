import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, Code, Copy } from 'lucide-react';
import { useExternalGames, useExternalCardSearch, useExternalCardPrices, useExternalRealtime, useExternalRarities, getExternalCardById, getExternalLatestPrice } from '@/hooks/useExternalTCG';
import { ExternalCard } from '@/integrations/supabase/client';
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
  
  // Debug state
  const [debugMode, setDebugMode] = useState(false);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugData, setDebugData] = useState<{ card: any; price: any } | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);

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
    cardNumber.trim() || undefined,
    {
      gameId: selectedGameId !== 'all' && selectedGameId ? selectedGameId : undefined,
      rarity: selectedRarity !== 'all' ? selectedRarity : undefined,
      page: 1,
      pageSize: 5,
    }
  );
  
  // Debug logging when enabled
  useEffect(() => {
    if (debugMode && suggestionsData) {
      console.log('🔍 Raw Card Search Response:', {
        query: { cardName: debouncedCardName, cardNumber },
        filters: { gameId: selectedGameId, rarity: selectedRarity },
        results: suggestionsData
      });
    }
  }, [debugMode, suggestionsData, debouncedCardName, cardNumber, selectedGameId, selectedRarity]);
  
  // No client-side filtering needed - server handles AND logic now
  const filteredSuggestions = useMemo(() => {
    return suggestionsData?.cards?.slice(0, 5) || [];
  }, [suggestionsData?.cards]);
  
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
  
  // Handle debug view
  const handleViewRaw = useCallback(async (card: ExternalCard) => {
    setDebugLoading(true);
    try {
      const [rawCard, rawPrice] = await Promise.all([
        getExternalCardById(card.id),
        getExternalLatestPrice(card.id)
      ]);
      
      setDebugData({ card: rawCard, price: rawPrice });
      setDebugDialogOpen(true);
      
      console.log('🔍 Raw card data for:', card.name, { rawCard, rawPrice });
    } catch (error) {
      console.error('Error fetching raw data:', error);
      toast.error('Failed to fetch raw data');
    } finally {
      setDebugLoading(false);
    }
  }, []);
  
  // Copy to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  }, []);
  
  // Card tile component
  const CardTile = ({ card, isSmall = false }: { card: ExternalCard; isSmall?: boolean }) => (
    <Card 
      className={`${debugMode ? 'cursor-default' : 'cursor-pointer hover:bg-accent'} transition-colors ${isSmall ? 'p-2' : 'p-3'}`}
      onClick={debugMode ? undefined : () => handleCardSelect(card)}
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
          {debugMode && (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardSelect(card);
                }}
                className="text-xs"
              >
                Select Card
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewRaw(card);
                }}
                disabled={debugLoading}
                className="text-xs"
              >
                <Code className="h-3 w-3 mr-1" />
                View Raw
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
  
  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Raw Card Search
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="debug-mode" className="text-sm font-normal">
                Debug
              </Label>
              <Switch
                id="debug-mode"
                checked={debugMode}
                onCheckedChange={setDebugMode}
              />
            </div>
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
      
      {/* Debug Dialog */}
      <Dialog open={debugDialogOpen} onOpenChange={setDebugDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Raw Card Data
            </DialogTitle>
          </DialogHeader>
          
          {debugData && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Card Data</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(JSON.stringify(debugData.card, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-60">
                  {JSON.stringify(debugData.card, null, 2)}
                </pre>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Latest Price Data</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(JSON.stringify(debugData.price, null, 2))}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-60">
                  {debugData.price ? JSON.stringify(debugData.price, null, 2) : 'No price data available'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}