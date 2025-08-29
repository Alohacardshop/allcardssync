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
  Eye, 
  Search,
  Calendar,
  Database,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { useCatalogSets } from "@/hooks/useCatalogBrowse";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SetsListProps {
  game: string;
  gameName: string;
  onViewCards: (setId: string, setName: string) => void;
}

export function SetsList({ game, gameName, onViewCards }: SetsListProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [syncingSet, setSyncingSet] = useState<string | null>(null);
  
  const { data: sets, totalCount, isLoading, refetch } = useCatalogSets(game, {
    search,
    sortBy: 'set_id',
    sortOrder: 'asc',
    limit: 100
  });

  const syncSet = async (setId: string, setName: string) => {
    setSyncingSet(setId);
    try {
      // Use catalog-sync-justtcg for individual set sync
      const { data, error } = await supabase.functions.invoke('catalog-sync-justtcg', {
        body: { 
          game,
          set: setName,
          force: true
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Set Sync Started",
        description: `Syncing ${setName} in the background`,
      });
      
      // Refresh the sets list after a delay
      setTimeout(() => {
        refetch();
      }, 2000);
      
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: `Failed to sync ${setName}: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSyncingSet(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  const isRecentlyUpdated = (dateStr?: string) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return hoursDiff < 24; // Within last 24 hours
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Sets for {gameName}
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
            placeholder="Search sets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sets Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading sets...</span>
          </div>
        ) : sets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {search ? 'No sets match your search' : 'No sets found for this game'}
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Database className="h-4 w-4" />
                      Cards
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Release
                    </div>
                  </TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.map((set) => (
                  <TableRow key={set.set_id}>
                    <TableCell className="font-medium">{set.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {set.set_id}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={set.cards_count > 0 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {set.cards_count}
                        </Badge>
                        {set.total && (
                          <span className="text-xs text-muted-foreground">
                            / {set.total}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {set.release_date ? formatDate(set.release_date) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          {formatDate(set.last_seen_at)}
                        </span>
                        {isRecentlyUpdated(set.last_seen_at) && (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => onViewCards(set.set_id, set.name)}
                          variant="outline"
                          size="sm"
                          disabled={set.cards_count === 0}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View Cards
                        </Button>
                        <Button
                          onClick={() => syncSet(set.set_id, set.name)}
                          disabled={syncingSet === set.set_id}
                          variant="secondary"
                          size="sm"
                        >
                          {syncingSet === set.set_id ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Syncing
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Sync
                            </>
                          )}
                        </Button>
                      </div>
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

export default SetsList;