import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchBar } from '@/components/tcg/SearchBar';
import { CardGrid } from '@/components/tcg/CardGrid';
import { GameSelector } from '@/components/tcg/GameSelector';
import { usePopularCards, useGames } from '@/hooks/useTCGData';
import { SearchResult, PopularCard } from '@/lib/tcg-supabase';
import { Sparkles, TrendingUp, Database } from 'lucide-react';

export default function TCGHome() {
  const navigate = useNavigate();
  const [selectedGame, setSelectedGame] = useState<string>('all');
  
  const { data: games = [] } = useGames();
  const { data: popularCards = [], isLoading: loadingPopular } = usePopularCards(
    selectedGame === 'all' ? undefined : selectedGame
  );

  const handleCardSelect = (card: SearchResult | PopularCard) => {
    navigate(`/tcg/card/${card.id}`);
  };

  const handleSearch = (query: string, results: SearchResult[]) => {
    if (results.length > 0) {
      navigate('/tcg/search', { state: { query, results } });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/20 to-background border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              TCG Database
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Comprehensive trading card game database with real-time pricing and market analysis
            </p>
          </div>

          {/* Search Section */}
          <div className="max-w-2xl mx-auto mb-8">
            <SearchBar
              placeholder="Search for any card across all games..."
              gameSlug={selectedGame === 'all' ? undefined : selectedGame}
              onCardSelect={handleCardSelect}
              onSearch={handleSearch}
            />
          </div>

          {/* Game Filter */}
          <div className="max-w-md mx-auto">
            <GameSelector
              value={selectedGame}
              onValueChange={setSelectedGame}
              placeholder="Filter by game"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Games</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{games.length}</div>
              <p className="text-xs text-muted-foreground">
                Trading card games
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Popular Cards</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{popularCards.length}</div>
              <p className="text-xs text-muted-foreground">
                Most traded cards
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Live Pricing</CardTitle>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Real-time</div>
              <p className="text-xs text-muted-foreground">
                Market data updates
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Game Navigation */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Browse by Game</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {games.map((game) => (
              <Card
                key={game.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/tcg/browse/${game.slug}`)}
              >
                <CardContent className="p-4">
                  {game.logo_url && (
                    <img
                      src={game.logo_url}
                      alt={game.name}
                      className="w-full h-24 object-contain mb-3"
                    />
                  )}
                  <h3 className="font-semibold text-center">{game.name}</h3>
                  {game.description && (
                    <p className="text-sm text-muted-foreground text-center mt-1 line-clamp-2">
                      {game.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Popular Cards */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              Popular Cards
              {selectedGame !== 'all' && games.find(g => g.slug === selectedGame) && (
                <Badge variant="secondary" className="ml-2">
                  {games.find(g => g.slug === selectedGame)?.name}
                </Badge>
              )}
            </h2>
            <Button 
              variant="outline" 
              onClick={() => navigate('/tcg/popular')}
            >
              View All
            </Button>
          </div>
          
          <CardGrid
            cards={popularCards}
            onCardClick={handleCardSelect}
            loading={loadingPopular}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/tcg/search')}>
            <CardHeader>
              <CardTitle>Advanced Search</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Search with filters for game, set, rarity, and more
              </p>
              <Button variant="outline" className="w-full">
                Go to Search
              </Button>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/tcg/browse')}>
            <CardHeader>
              <CardTitle>Browse Collection</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Browse cards by game and set hierarchy
              </p>
              <Button variant="outline" className="w-full">
                Start Browsing
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}