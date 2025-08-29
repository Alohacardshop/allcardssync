import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Loader2, 
  RefreshCw, 
  Search,
  ArrowLeft,
  Sparkles,
  Hash,
  Database
} from "lucide-react";
import { useCatalogCards } from "@/hooks/useCatalogBrowse";

interface CardsViewProps {
  game: string;
  gameName: string;
  setId?: string;
  setName?: string;
  onBack?: () => void;
}

export function CardsView({ game, gameName, setId, setName, onBack }: CardsViewProps) {
  const [search, setSearch] = useState('');
  
  const { data: cards, totalCount, isLoading, refetch } = useCatalogCards(game, {
    search,
    setId,
    sortBy: 'name',
    sortOrder: 'asc',
    limit: 100
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  const title = setId && setName 
    ? `Cards in ${setName}` 
    : `All Cards for ${gameName}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Database className="h-5 w-5 text-primary" />
            {title}
            <Badge variant="secondary">{totalCount} total</Badge>
          </div>
          <Button
            onClick={() => refetch()}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Cards Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading cards...</span>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {search ? 'No cards match your search' : 'No cards found'}
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card Name</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Hash className="h-4 w-4" />
                      Number
                    </div>
                  </TableHead>
                  {!setId && (
                    <TableHead>Set</TableHead>
                  )}
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-4 w-4" />
                      Rarity
                    </div>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.card_id}>
                    <TableCell className="font-medium">
                      <div>
                        <div>{card.name}</div>
                        <code className="text-xs text-muted-foreground">
                          {card.card_id}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      {card.number ? (
                        <Badge variant="outline" className="text-xs">
                          {card.number}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {!setId && (
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                          {card.set_id}
                        </code>
                      </TableCell>
                    )}
                    <TableCell>
                      {card.rarity ? (
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                        >
                          {card.rarity}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {card.supertype ? (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                        >
                          {card.supertype}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {formatDate(card.last_seen_at)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CardsView;