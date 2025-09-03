import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCard, useCardPricing, fetchCardPricing } from '@/hooks/useTCGData';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Heart, DollarSign, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function TCGCard() {
  const { cardId } = useParams<{ cardId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [refreshingPricing, setRefreshingPricing] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<string>('near_mint');
  const [selectedPrinting, setSelectedPrinting] = useState<string>('normal');

  const { data: card, isLoading: cardLoading, error: cardError } = useCard(cardId);
  const { data: pricing, isLoading: pricingLoading } = useCardPricing(
    card?.justtcg_card_id,
    selectedCondition,
    selectedPrinting
  );

  const handleRefreshPricing = async () => {
    if (!card?.justtcg_card_id) return;
    
    setRefreshingPricing(true);
    try {
      await fetchCardPricing(card.justtcg_card_id, selectedCondition, selectedPrinting, true);
      
      // Invalidate and refetch pricing data
      queryClient.invalidateQueries({ 
        queryKey: ['tcg-pricing', card.justtcg_card_id, selectedCondition, selectedPrinting] 
      });
      
      toast({
        title: "Success",
        description: "Pricing data refreshed successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh pricing data",
        variant: "destructive",
      });
    } finally {
      setRefreshingPricing(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleAddToWatchlist = () => {
    if (!card) return;
    
    const watchlist = JSON.parse(localStorage.getItem('tcg-watchlist') || '[]');
    const cardData = {
      id: card.id,
      name: card.name,
      image_url: card.image_url,
      set_name: card.sets?.name,
      game_name: card.sets?.games?.name,
      added_at: new Date().toISOString()
    };
    
    if (!watchlist.find((item: any) => item.id === card.id)) {
      watchlist.push(cardData);
      localStorage.setItem('tcg-watchlist', JSON.stringify(watchlist));
      toast({
        title: "Added to Watchlist",
        description: `${card.name} has been added to your watchlist`,
      });
    } else {
      toast({
        title: "Already in Watchlist",
        description: `${card.name} is already in your watchlist`,
      });
    }
  };

  if (cardLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (cardError || !card) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Card not found</p>
            <Button onClick={() => navigate('/tcg')}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="container mx-auto px-4 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Card Image */}
          <div className="flex justify-center">
            <div className="max-w-md w-full">
              {card.image_url ? (
                <img
                  src={card.image_url}
                  alt={card.name}
                  className="w-full rounded-lg shadow-lg"
                />
              ) : (
                <div className="aspect-[2.5/3.5] bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground">No Image Available</span>
                </div>
              )}
            </div>
          </div>

          {/* Card Details */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{card.name}</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="secondary">
                  {card.sets?.games?.name}
                </Badge>
                <Badge variant="outline">
                  {card.sets?.name}
                </Badge>
                {card.rarity && (
                  <Badge variant="default">
                    {card.rarity}
                  </Badge>
                )}
              </div>
            </div>

            {/* Card Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Card Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {card.type_line && (
                  <div>
                    <span className="font-medium">Type: </span>
                    <span className="text-muted-foreground">{card.type_line}</span>
                  </div>
                )}
                {card.mana_cost && (
                  <div>
                    <span className="font-medium">Mana Cost: </span>
                    <span className="text-muted-foreground">{card.mana_cost}</span>
                  </div>
                )}
                {card.oracle_text && (
                  <div>
                    <span className="font-medium">Oracle Text: </span>
                    <p className="text-muted-foreground mt-2 whitespace-pre-wrap">
                      {card.oracle_text}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={handleAddToWatchlist} className="flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Add to Watchlist
              </Button>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Market Pricing
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshPricing}
                disabled={refreshingPricing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshingPricing ? 'animate-spin' : ''}`} />
                Refresh Pricing
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pricingLoading || refreshingPricing ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading pricing data...</p>
              </div>
            ) : pricing?.variants && pricing.variants.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pricing.variants.map((variant, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant="outline" className="mb-1">
                              {variant.condition.replace('_', ' ')}
                            </Badge>
                            {variant.printing !== 'normal' && (
                              <Badge variant="secondary" className="ml-1">
                                {variant.printing}
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold">
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
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No pricing data available</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Click "Refresh Pricing" to fetch the latest market data
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}