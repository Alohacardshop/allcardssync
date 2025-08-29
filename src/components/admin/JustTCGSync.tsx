
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, AlertCircle, Info, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CatalogResetRebuild } from "./CatalogResetRebuild";

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

const JustTCGSync = () => {
  const { toast } = useToast();
  const [games, setGames] = useState<GameData[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [syncStatus, setSyncStatus] = useState<GameSyncStatus>({});

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
                  Step 2: Sync Individual Games
                </CardTitle>
                <CardDescription>
                  Select games to sync their cards and sets data
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
                      <div key={game.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{game.name}</h4>
                            <Badge variant="outline" className="text-xs">
                              {game.id}
                            </Badge>
                          </div>
                          
                          {lastSync && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Last synced: {lastSync}
                            </p>
                          )}
                          
                          {hasError && (
                            <p className="text-sm text-destructive mt-1">
                              Error: {status.error}
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
                            onClick={() => syncGame(game.id, game.name)}
                            disabled={isLoading}
                            variant={hasError ? "destructive" : "default"}
                            size="sm"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Syncing...
                              </>
                            ) : hasError ? (
                              'Retry Sync'
                            ) : lastSync ? (
                              'Re-sync'
                            ) : (
                              'Sync Game'
                            )}
                          </Button>
                        </div>
                      </div>
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
                  <li><strong>Select Games:</strong> Choose which games you want to sync</li>
                  <li><strong>Individual Sync:</strong> Each game syncs independently with progress tracking</li>
                  <li><strong>Retry on Error:</strong> Failed syncs can be retried individually</li>
                  <li><strong>Status Tracking:</strong> See sync status and last sync time for each game</li>
                </ol>
              </div>
              
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <strong>Controlled Process:</strong> Sync games one by one for better control and easier troubleshooting. 
                  Each sync is independent and won't affect other games.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
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

export default JustTCGSync;
