
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, AlertCircle, Info, RefreshCw, Download, Database, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCatalogStats } from "@/hooks/useCatalogStats";
import { CatalogResetRebuild } from "./CatalogResetRebuild";
import { SetsList } from "./SetsList";
import { CardsView } from "./CardsView";

interface GameData {
  id: string;
  name: string;
  active: boolean;
}

interface GameSyncStatus {
  [gameId: string]: {
    isLoading: boolean;
    lastSync?: string;
    error?: string;
  };
}

type ViewMode = 'games' | 'sets' | 'cards';

interface ViewState {
  mode: ViewMode;
  gameId?: string;
  gameName?: string;
  setId?: string;
  setName?: string;
}

const JustTCGSync = () => {
  const { toast } = useToast();
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [syncStatus, setSyncStatus] = useState<GameSyncStatus>({});
  const [viewState, setViewState] = useState<ViewState>({ mode: 'games' });

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
      
      toast({
        title: "Games Loaded",
        description: `Found ${formattedGames.length} games with card data`,
      });
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

  // Sync individual game
  const syncGame = useCallback(async (gameId: string, gameName: string) => {
    setSyncStatus(prev => ({
      ...prev,
      [gameId]: { isLoading: true }
    }));

    try {
      const { data, error } = await supabase.functions.invoke('catalog-rebuild-stream', {
        body: { games: [gameId] }
      });
      
      if (error) throw error;
      
      setSyncStatus(prev => ({
        ...prev,
        [gameId]: { 
          isLoading: false, 
          lastSync: new Date().toLocaleString(),
          error: undefined
        }
      }));
      
      toast({
        title: "Sync Complete",
        description: `${gameName} has been synced successfully`,
      });
    } catch (error: any) {
      setSyncStatus(prev => ({
        ...prev,
        [gameId]: { 
          isLoading: false,
          error: error.message 
        }
      }));
      
      toast({
        title: "Sync Failed",
        description: `Failed to sync ${gameName}: ${error.message}`,
        variant: "destructive",
      });
    }
  }, [toast]);

  // Navigation functions
  const showSets = (gameId: string, gameName: string) => {
    setViewState({ mode: 'sets', gameId, gameName });
  };

  const showCards = (gameId: string, gameName: string, setId?: string, setName?: string) => {
    setViewState({ mode: 'cards', gameId, gameName, setId, setName });
  };

  const showGames = () => {
    setViewState({ mode: 'games' });
  };

  useEffect(() => {
    loadGames();
  }, [loadGames]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Tabs defaultValue="games" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="games">Game Sync</TabsTrigger>
          <TabsTrigger value="rebuild">Reset & Rebuild</TabsTrigger>
        </TabsList>

        <TabsContent value="games" className="space-y-6">
          {viewState.mode === 'games' && (
            <>
              {/* Step 1: Discover Games */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Step 1: Discover Games
              </CardTitle>
              <CardDescription>
                Load available games from JustTCG API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button 
                  onClick={loadGames} 
                  disabled={isLoadingGames}
                  size="lg"
                >
                  {isLoadingGames ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Discovering Games...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Discover Games
                    </>
                  )}
                </Button>
                
                {games.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {games.length} games found
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

              {/* Step 2: Select and Sync Games */}
              {games.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5 text-primary" />
                      Step 2: Manage Games
                    </CardTitle>
                    <CardDescription>
                      Sync games and explore their sets and cards
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4">
                      {games.map((game) => {
                        const status = syncStatus[game.id];
                        const isLoading = status?.isLoading || false;
                        const hasError = !!status?.error;
                        const lastSync = status?.lastSync;

                        return (
                          <GameRow 
                            key={game.id}
                            game={game}
                            status={status}
                            onSync={() => syncGame(game.id, game.name)}
                            onViewSets={() => showSets(game.id, game.name)}
                            onViewCards={() => showCards(game.id, game.name)}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    How This Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-4">
                      <li><strong>Discover Games:</strong> Load available games from JustTCG API</li>
                      <li><strong>Sync Games:</strong> Sync entire games or individual sets</li>
                      <li><strong>Browse Data:</strong> View sets and cards for each game</li>
                      <li><strong>Individual Control:</strong> Each operation is independent with progress tracking</li>
                    </ol>
                  </div>
                  
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Controlled Process:</strong> Step-by-step sync and browsing for better control and easier troubleshooting.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </>
          )}

          {viewState.mode === 'sets' && viewState.gameId && (
            <SetsList
              game={viewState.gameId}
              gameName={viewState.gameName!}
              onViewCards={(setId, setName) => showCards(viewState.gameId!, viewState.gameName!, setId, setName)}
            />
          )}

          {viewState.mode === 'cards' && viewState.gameId && (
            <CardsView
              game={viewState.gameId}
              gameName={viewState.gameName!}
              setId={viewState.setId}
              setName={viewState.setName}
              onBack={() => viewState.setId ? showSets(viewState.gameId!, viewState.gameName!) : showGames()}
            />
          )}
        </TabsContent>

        <TabsContent value="rebuild" className="space-y-6">
          <CatalogResetRebuild />
          
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Advanced Option:</strong> The Reset & Rebuild tool is for bulk operations and troubleshooting. 
              For normal operations, use the Game Sync tab above for better control.
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Game row component with stats and actions
function GameRow({ 
  game, 
  status, 
  onSync, 
  onViewSets, 
  onViewCards 
}: {
  game: GameData;
  status?: GameSyncStatus[string];
  onSync: () => void;
  onViewSets: () => void;
  onViewCards: () => void;
}) {
  const isLoading = status?.isLoading || false;
  const hasError = !!status?.error;
  const lastSync = status?.lastSync;

  // Get stats for this game
  const { data: stats } = useCatalogStats(game.id);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-medium">{game.name}</h4>
          <Badge variant="outline" className="text-xs">
            {game.id}
          </Badge>
        </div>
        
        {stats && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
            <div className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              <span>{stats.sets_count} sets</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              <span>{stats.cards_count} cards</span>
            </div>
            {stats.pending_count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {stats.pending_count} pending
              </Badge>
            )}
          </div>
        )}
        
        {lastSync && (
          <p className="text-sm text-muted-foreground">
            Last synced: {lastSync}
          </p>
        )}
        
        {hasError && (
          <p className="text-sm text-destructive">
            Error: {status?.error}
          </p>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {lastSync && !hasError && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        
        {hasError && (
          <AlertCircle className="h-4 w-4 text-destructive" />
        )}
        
        <Button
          onClick={onViewSets}
          variant="outline"
          size="sm"
        >
          <Database className="mr-1 h-3 w-3" />
          Sets
        </Button>
        
        <Button
          onClick={onViewCards}
          variant="outline"
          size="sm"
        >
          <Layers className="mr-1 h-3 w-3" />
          Cards
        </Button>
        
        <Button
          onClick={onSync}
          disabled={isLoading}
          variant={hasError ? "destructive" : "default"}
          size="sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Syncing...
            </>
          ) : hasError ? (
            'Retry'
          ) : lastSync ? (
            'Re-sync'
          ) : (
            'Sync'
          )}
        </Button>
      </div>
    </div>
  );
}

export default JustTCGSync;
