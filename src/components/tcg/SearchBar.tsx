import { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCardSearch } from '@/hooks/useTCGData';
import { SearchResult } from '@/lib/tcg-supabase';

interface SearchBarProps {
  onCardSelect?: (card: SearchResult) => void;
  onSearch?: (query: string, results: SearchResult[]) => void;
  placeholder?: string;
  gameSlug?: string;
  setCode?: string;
  showDropdown?: boolean;
}

export function SearchBar({ 
  onCardSelect, 
  onSearch,
  placeholder = "Search for cards...",
  gameSlug,
  setCode,
  showDropdown = true 
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  const { data: results = [], isLoading } = useCardSearch(debouncedQuery, gameSlug, setCode);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle search results
  useEffect(() => {
    if (results.length > 0 && onSearch) {
      onSearch(debouncedQuery, results);
    }
  }, [results, debouncedQuery, onSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCardSelect = (card: SearchResult) => {
    setQuery(card.name);
    setShowResults(false);
    onCardSelect?.(card);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setShowResults(false);
      if (results.length > 0) {
        handleCardSelect(results[0]);
      }
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 animate-spin" />
        )}
      </div>

      {showDropdown && showResults && query.trim() && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
              Searching...
            </div>
          ) : results.length > 0 ? (
            results.map((card) => (
              <button
                key={card.id}
                onClick={() => handleCardSelect(card)}
                className="w-full p-3 text-left hover:bg-muted/50 border-b border-border last:border-b-0 flex items-center gap-3"
              >
                {card.image_url && (
                  <img 
                    src={card.image_url} 
                    alt={card.name}
                    className="w-10 h-14 object-cover rounded"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{card.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {card.set_name} • {card.game_name}
                    {card.rarity && ` • ${card.rarity}`}
                  </div>
                </div>
              </button>
            ))
          ) : query.trim() && (
            <div className="p-4 text-center text-muted-foreground">
              No cards found
            </div>
          )}
        </div>
      )}
    </div>
  );
}