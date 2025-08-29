
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CatalogResetRebuild } from "./CatalogResetRebuild";

interface GameData {
  id: string;
  name: string;
  active: boolean;
}

const JustTCGSync = () => {
  const { toast } = useToast();
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);

  // Load games from JustTCG discover API
  const loadGames = useCallback(async () => {
    setIsLoadingGames(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-games');
      
      if (error) throw error;
      
      const gamesArray = data?.data || [];
      const formattedGames = gamesArray
        .filter((game: any) => game.cards_count > 0)
        .map((game: any) => ({
          id: game.id === 'undefined' ? 'gundam-card-game' : game.id,
          name: game.name,
          active: true
        }));

      setGames(formattedGames);
    } catch (error: any) {
      toast({
        title: "Error loading games",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingGames(false);
    }
  }, [toast]);

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* New Simplified Reset & Rebuild Interface */}
      <CatalogResetRebuild />

      {/* Available Games Info */}
      <Card>
        <CardHeader>
          <CardTitle>Available JustTCG Games</CardTitle>
          <CardDescription>
            Games discovered from JustTCG API with card data available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingGames ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading games...
            </div>
          ) : games.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {games.map((game) => (
                <Badge key={game.id} variant="secondary">
                  {game.name}
                </Badge>
              ))}
            </div>
          ) : (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No games found. Try refreshing the page or check the API connection.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="mt-4">
            <Button 
              onClick={loadGames} 
              variant="outline" 
              size="sm"
              disabled={isLoadingGames}
            >
              {isLoadingGames ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                'Refresh Games'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            How to Use
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <h4 className="font-medium">Reset & Rebuild Process:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
              <li>Select one or more games to rebuild</li>
              <li>Click "Reset & Rebuild" to start the process</li>
              <li>Watch live progress logs as data is imported into shadow tables</li>
              <li>Bad provider IDs are automatically fixed using exact name matching</li>
              <li>Data is validated before atomic swap to live tables</li>
              <li>Process is idempotent and can be safely re-run</li>
            </ol>
          </div>
          
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <strong>Safe Operation:</strong> Uses shadow tables and atomic swaps. 
              No data loss risk. Exact-only matching prevents cross-language conflicts.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default JustTCGSync;
