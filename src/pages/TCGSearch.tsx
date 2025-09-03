import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SearchBar } from '@/components/tcg/SearchBar';
import { CardGrid } from '@/components/tcg/CardGrid';
import { GameSelector } from '@/components/tcg/GameSelector';
import { useCardSearch } from '@/hooks/useTCGData';
import { SearchResult } from '@/lib/tcg-supabase';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TCGSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get initial state from navigation
  const initialQuery = location.state?.query || '';
  const initialResults = location.state?.results || [];
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [searchResults, setSearchResults] = useState<SearchResult[]>(initialResults);

  const { data: results = [], isLoading } = useCardSearch(
    searchQuery,
    selectedGame === 'all' ? undefined : selectedGame
  );

  useEffect(() => {
    if (searchQuery && results.length > 0) {
      setSearchResults(results);
    }
  }, [results, searchQuery]);

  const handleCardSelect = (card: SearchResult) => {
    navigate(`/tcg/card/${card.id}`);
  };

  const handleSearch = (query: string, results: SearchResult[]) => {
    setSearchQuery(query);
    setSearchResults(results);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-b from-primary/10 to-background border-b">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/tcg')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </div>

          <h1 className="text-3xl font-bold mb-6">Search Cards</h1>

          {/* Search Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <SearchBar
                placeholder="Enter card name, set, or game..."
                gameSlug={selectedGame === 'all' ? undefined : selectedGame}
                onCardSelect={handleCardSelect}
                onSearch={handleSearch}
                showDropdown={false}
              />
            </div>
            <GameSelector
              value={selectedGame}
              onValueChange={setSelectedGame}
              placeholder="Filter by game"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="container mx-auto px-4 py-8">
        {searchQuery && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>
                Search Results for "{searchQuery}"
                {searchResults.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-2">
                    ({searchResults.length} cards found)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-muted-foreground mt-2">Searching...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <CardGrid
                  cards={searchResults}
                  onCardClick={handleCardSelect}
                />
              ) : searchQuery ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    No cards found for "{searchQuery}"
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Try adjusting your search terms or game filter
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {!searchQuery && (
          <Card>
            <CardHeader>
              <CardTitle>Advanced Search</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Search through our comprehensive database of trading cards.
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Search by card name, set name, or game</li>
                <li>• Filter results by specific games</li>
                <li>• Browse thousands of cards with real-time pricing</li>
                <li>• Click on any card to view detailed information</li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}