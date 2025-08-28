
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Play, Square, RotateCcw, Clock, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { debounce } from 'lodash';

function normalizeGameSlug(g: string) {
  if (g === 'pokemon_japan') return 'pokemon-japan';
  if (g === 'mtg') return 'magic-the-gathering';
  return g;
}

interface GameData {
  id: string;
  name: string;
  active: boolean;
}

interface SetData {
  set_id: string;
  name: string;
}

interface SyncPreferences {
  selected_games: string[];
  selected_sets: string[];
  sets_game_filter: string;
  only_new_sets: boolean;
  skip_recently_updated: boolean;
  force_resync: boolean;
  since_days: number;
}

const JustTCGSync = () => {
  const { toast } = useToast();
  const [games, setGames] = useState<GameData[]>([]);
  const [sets, setSets] = useState<SetData[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingSets, setIsLoadingSets] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<any[]>([]);

  // User preferences state
  const [preferences, setPreferences] = useState<SyncPreferences>({
    selected_games: [],
    selected_sets: [],
    sets_game_filter: 'all',
    only_new_sets: true,
    skip_recently_updated: true,
    force_resync: false,
    since_days: 30
  });

  // Load user preferences from database with localStorage fallback
  const loadPreferences = useCallback(async () => {
    try {
      const { data: userPrefs, error } = await supabase
        .from('user_sync_preferences')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error
        console.warn('Failed to load preferences from database:', error);
      }

      if (userPrefs) {
        setPreferences({
          selected_games: userPrefs.selected_games || [],
          selected_sets: userPrefs.selected_sets || [],
          sets_game_filter: userPrefs.sets_game_filter || 'all',
          only_new_sets: userPrefs.only_new_sets ?? true,
          skip_recently_updated: userPrefs.skip_recently_updated ?? true,
          force_resync: userPrefs.force_resync ?? false,
          since_days: userPrefs.since_days || 30
        });
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem('justtcg-sync-preferences');
        if (stored) {
          const parsed = JSON.parse(stored);
          setPreferences(prev => ({ ...prev, ...parsed }));
        }
      }
    } catch (error) {
      console.warn('Error loading preferences:', error);
      // Try localStorage fallback
      const stored = localStorage.getItem('justtcg-sync-preferences');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setPreferences(prev => ({ ...prev, ...parsed }));
        } catch (parseError) {
          console.warn('Failed to parse localStorage preferences:', parseError);
        }
      }
    }
  }, []);

  // Save preferences to database (debounced)
  const savePreferences = useCallback(
    debounce(async (newPrefs: SyncPreferences) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
          .from('user_sync_preferences')
          .upsert({
            user_id: user.id,
            ...newPrefs,
            last_used_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          });

        if (error) {
          console.warn('Failed to save preferences to database:', error);
        }
      } catch (error) {
        console.warn('Error saving preferences:', error);
      }
      
      // Always save to localStorage as backup
      localStorage.setItem('justtcg-sync-preferences', JSON.stringify(newPrefs));
    }, 1000),
    []
  );

  // Update preferences and save
  const updatePreferences = useCallback((updates: Partial<SyncPreferences>) => {
    setPreferences(prev => {
      const newPrefs = { ...prev, ...updates };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  // Load games from JustTCG discover API
  const loadGames = useCallback(async () => {
    setIsLoadingGames(true);
    try {
      const { data, error } = await supabase.functions.invoke('discover-games');
      
      if (error) throw error;
      
      // Map API response to our GameData format
      const gamesArray = data?.data || [];
      const formattedGames = gamesArray
        .filter((game: any) => game.cards_count > 0) // Only show games with cards
        .map((game: any) => ({
          id: game.id === 'undefined' ? 'gundam-card-game' : game.id, // Fix undefined ID
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

  // Load sets based on selected games
  const loadSets = useCallback(async () => {
    if (preferences.selected_games.length === 0) {
      setSets([]);
      return;
    }

    setIsLoadingSets(true);
    try {
      const selectedGame = preferences.selected_games[0];
      console.log('Loading sets for game:', selectedGame, 'only_new_sets:', preferences.only_new_sets);
      
      if (preferences.only_new_sets) {
        // Only show sets with no cards (pending sets)
        const { data: pendingSets, error } = await supabase
          .rpc('catalog_v2_pending_sets', {
            game_in: selectedGame,
            limit_in: 1000
          });

        if (error) throw error;
        console.log('Pending sets response:', pendingSets?.length, 'sets');
        setSets(pendingSets?.map((s: any) => ({ set_id: s.set_id, name: s.name })) || []);
      } else {
        // Use browse sets function to get all sets for the selected game
        const { data: browseSetsResponse, error } = await supabase
          .rpc('catalog_v2_browse_sets', {
            game_in: selectedGame,
            limit_in: 1000
          });

        if (error) throw error;
        const setsResponse = browseSetsResponse as any;
        const setsData = setsResponse?.sets || [];
        console.log('Browse sets response:', setsData.length, 'sets for game:', selectedGame);
        setSets(setsData.map((s: any) => ({ set_id: s.set_id, name: s.name })));
      }
    } catch (error: any) {
      console.error('Error loading sets:', error);
      toast({
        title: "Error loading sets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoadingSets(false);
    }
  }, [preferences.selected_games, preferences.only_new_sets, toast]);

  // Initialize on mount
  useEffect(() => {
    loadPreferences();
    loadGames();
  }, [loadPreferences, loadGames]);

  // Load sets when games selection changes
  useEffect(() => {
    loadSets();
  }, [loadSets]);

  // Handle single set sync
  const handleSyncSet = async (setId: string, setName: string) => {
    if (!preferences.selected_games.length) {
      toast({
        title: "No game selected",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    const startTime = Date.now();

    try {
      const normalized = normalizeGameSlug(preferences.selected_games[0]);
      if (normalized !== preferences.selected_games[0]) {
        toast({ 
          title: 'Normalized game', 
          description: `${preferences.selected_games[0]} → ${normalized}` 
        });
      }
      
      const cooldownHours = preferences.skip_recently_updated ? 12 : 0;
      
      const { data, error } = await supabase.functions.invoke('catalog-sync', {
        body: {
          setId,
          game: normalized,
          cooldownHours,
          forceSync: preferences.force_resync
        }
      });

      if (error) throw error;

      const duration = Date.now() - startTime;
      const result = {
        setId,
        setName,
        status: data.status,
        message: data.message,
        duration,
        timestamp: new Date().toISOString(),
        ...data
      };

      setSyncResults(prev => [result, ...prev.slice(0, 19)]); // Keep last 20 results

      if (data.status === 'skipped_cooldown') {
        toast({
          title: "Set Skipped",
          description: data.message,
          variant: "default",
        });
      } else if (data.status === 'success') {
        toast({
          title: "Sync Complete",
          description: `${setName}: ${data.cardsProcessed} cards, ${data.variantsProcessed} variants`,
        });
      } else {
        toast({
          title: "Sync Completed with Issues",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      const result = {
        setId,
        setName,
        status: 'error',
        message: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };

      setSyncResults(prev => [result, ...prev.slice(0, 19)]);

      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'skipped_cooldown':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>;
      case 'skipped_cooldown':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Skipped</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>JustTCG Data Sync</CardTitle>
          <CardDescription>
            Sync trading card data from JustTCG API. Your selections are automatically saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Game Selection */}
          <div className="space-y-2">
            <Label>Select Games</Label>
            <div className="flex flex-wrap gap-2">
              {isLoadingGames ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading games...</span>
                </div>
              ) : (
                games.map((game) => (
                  <div key={game.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`game-${game.id}`}
                      checked={preferences.selected_games.includes(game.id)}
                      onCheckedChange={(checked) => {
                        const newGames = checked
                          ? [...preferences.selected_games, game.id]
                          : preferences.selected_games.filter(g => g !== game.id);
                        updatePreferences({ selected_games: newGames, selected_sets: [] });
                      }}
                    />
                    <Label htmlFor={`game-${game.id}`} className="cursor-pointer">
                      {game.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Sync Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="only-new-sets"
                checked={preferences.only_new_sets}
                onCheckedChange={(checked) => updatePreferences({ only_new_sets: !!checked })}
              />
              <Label htmlFor="only-new-sets" className="cursor-pointer">
                Only show new sets (no cards yet)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="skip-recently-updated"
                checked={preferences.skip_recently_updated}
                onCheckedChange={(checked) => updatePreferences({ skip_recently_updated: !!checked })}
              />
              <Label htmlFor="skip-recently-updated" className="cursor-pointer">
                Skip recently synced sets (12h cooldown)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="force-resync"
                checked={preferences.force_resync}
                onCheckedChange={(checked) => updatePreferences({ force_resync: !!checked })}
              />
              <Label htmlFor="force-resync" className="cursor-pointer">
                Force resync (ignore cooldown)
              </Label>
            </div>
          </div>

          <Separator />

          {/* Sets List */}
          {preferences.selected_games.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Available Sets ({sets.length})</Label>
                {isLoadingSets && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading sets...</span>
                  </div>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto border rounded-md p-2 space-y-1">
                {sets.map((set) => (
                  <div key={set.set_id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                    <div>
                      <span className="font-medium">{set.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">({set.set_id})</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSyncSet(set.set_id, set.name)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Sync
                    </Button>
                  </div>
                ))}
                {sets.length === 0 && !isLoadingSets && (
                  <div className="text-center text-muted-foreground py-4">
                    No sets available for the selected games
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Results */}
      {syncResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Sync Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {syncResults.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(result.status)}
                    <div>
                      <span className="font-medium">{result.setName}</span>
                      <div className="text-sm text-muted-foreground">
                        {new Date(result.timestamp).toLocaleTimeString()} • {result.duration}ms
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(result.status)}
                    <div className="text-sm text-muted-foreground mt-1">
                      {result.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default JustTCGSync;
