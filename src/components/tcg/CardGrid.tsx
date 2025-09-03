import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchResult, PopularCard } from '@/lib/tcg-supabase';

interface CardGridProps {
  cards: (SearchResult | PopularCard)[];
  onCardClick?: (card: SearchResult | PopularCard) => void;
  loading?: boolean;
}

export function CardGrid({ cards, onCardClick, loading }: CardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Card key={i} className="aspect-[2.5/3.5] animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No cards found</p>
      </div>
    );
  }

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <Card 
          key={card.id}
          className="group cursor-pointer hover:shadow-lg transition-all duration-200 overflow-hidden"
          onClick={() => onCardClick?.(card)}
        >
          <div className="aspect-[2.5/3.5] relative overflow-hidden">
            {card.image_url ? (
              <img
                src={card.image_url}
                alt={card.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-xs text-center p-2">
                  No Image
                </span>
              </div>
            )}
            
            {/* Overlay with card info */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
              <h3 className="text-white text-xs font-medium line-clamp-2 mb-1">
                {card.name}
              </h3>
              
              <div className="flex flex-wrap gap-1 mb-1">
                <Badge variant="secondary" className="text-xs px-1 py-0">
                  {card.set_name}
                </Badge>
                {'rarity' in card && card.rarity && (
                  <Badge variant="outline" className="text-xs px-1 py-0 text-white border-white/30">
                    {card.rarity}
                  </Badge>
                )}
              </div>

              {/* Show price for popular cards */}
              {'avg_price_cents' in card && card.avg_price_cents && (
                <div className="text-white text-xs">
                  Avg: {formatPrice(card.avg_price_cents)}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}