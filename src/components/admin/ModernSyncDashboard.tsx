import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  RefreshCw, 
  Database, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  Play,
  Square,
  RotateCcw,
  TrendingUp,
  Zap,
  FileText,
  Calendar
} from 'lucide-react';

interface SystemHealth {
  api_status: 'healthy' | 'degraded' | 'down';
  total_games: number;
  total_sets: number;
  jobs_today: number;
  avg_job_duration: number;
}

interface GameData {
  id: string;
  name: string;
}

interface SetData {
  id: string;
  name: string;
  sync_status?: string;
  card_count?: number;
  last_synced_at?: string;
}

export function ModernSyncDashboard() {
  const { toast } = useToast();
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [availableGames, setAvailableGames] = useState<GameData[]>([]);
  const [availableSets, setAvailableSets] = useState<SetData[]>([]);
  const [recentActivity, setRecentActivity] = useState<string[]>([]);
  const [loading, setLoading] = useState({
    games: false,
    sets: false,
    cards: false,
    health: false
  });

  useEffect(() => {
    fetchSystemHealth();
    fetchAvailableGames();
    loadRecentActivity();
  }, []);

  useEffect(() => {
    if (selectedGame) {
      fetchAvailableSets();
    } else {
      setAvailableSets([]);
      setSelectedSet('');
    }
  }, [selectedGame]);

  const fetchSystemHealth = async () => {
    setLoading(prev => ({ ...prev, health: true }));
    try {
      // Get system statistics from available tables
      const [gamesRes, setsRes] = await Promise.all([
        supabase.from('games').select('*', { count: 'exact', head: true }),
        supabase.from('sets').select('*', { count: 'exact', head: true })
      ]);

      // Test API health
      const healthResponse = await supabase.functions.invoke('justtcg-health');
      
      setSystemHealth({
        api_status: healthResponse.error ? 'down' : 'healthy',
        total_games: gamesRes.count || 0,
        total_sets: setsRes.count || 0,
        jobs_today: 0, // Will be populated when job tracking is available
        avg_job_duration: 0
      });
    } catch (error) {
      console.error('Error fetching system health:', error);
      setSystemHealth({
        api_status: 'down',
        total_games: 0,
        total_sets: 0,
        jobs_today: 0,
        avg_job_duration: 0
      });
    } finally {
      setLoading(prev => ({ ...prev, health: false }));
    }
  };

  const fetchAvailableGames = async () => {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setAvailableGames(data || []);
    } catch (error) {
      console.error('Error fetching games:', error);
    }
  };

  const fetchAvailableSets = async () => {
    if (!selectedGame) return;

    try {
      const { data, error } = await supabase
        .from('sets')
        .select('id, name')
        .eq('game', selectedGame)
        .order('name')
        .limit(100);

      if (error) throw error;
      setAvailableSets(data || []);
    } catch (error) {
      console.error('Error fetching sets:', error);
    }
  };

  const loadRecentActivity = () => {
    // Mock recent activity for now
    setRecentActivity([
      "✅ Games sync completed - 5 games processed",
      "🎴 Sets sync started for Pokemon", 
      "⚡ API health check passed",
      "🃏 Cards sync completed for Base Set"
    ]);
  };

  const syncGames = async () => {
    setLoading(prev => ({ ...prev, games: true }));
    try {
      const { data, error } = await supabase.functions.invoke('sync-games-v2');
      
      if (error) throw error;
      
      toast({
        title: "Games Sync Started",
        description: data?.message || "Games sync has been initiated",
      });
      
      // Add to recent activity
      setRecentActivity(prev => [`🎮 Games sync started at ${new Date().toLocaleTimeString()}`, ...prev.slice(0, 3)]);
      
      fetchSystemHealth();
    } catch (error: any) {
      toast({
        title: "Games Sync Failed",
        description: error.message || "Failed to start games sync",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, games: false }));
    }
  };

  const syncSets = async (forceResync = false) => {
    if (!selectedGame) {
      toast({
        title: "No Game Selected",
        description: "Please select a game first",
        variant: "destructive"
      });
      return;
    }

    setLoading(prev => ({ ...prev, sets: true }));
    try {
      const { data, error } = await supabase.functions.invoke('sync-sets-v2', {
        body: { game: selectedGame, forceResync }
      });
      
      if (error) throw error;
      
      toast({
        title: "Sets Sync Started",
        description: data?.message || `Started syncing sets for ${selectedGame}`,
      });
      
      setRecentActivity(prev => [`🎴 Sets sync started for ${selectedGame} at ${new Date().toLocaleTimeString()}`, ...prev.slice(0, 3)]);
      
      fetchAvailableSets();
    } catch (error: any) {
      toast({
        title: "Sets Sync Failed",
        description: error.message || "Failed to start sets sync",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, sets: false }));
    }
  };

  const syncCards = async (forceResync = false) => {
    if (!selectedGame || !selectedSet) {
      toast({
        title: "Missing Selection",
        description: "Please select both game and set",
        variant: "destructive"
      });
      return;
    }

    setLoading(prev => ({ ...prev, cards: true }));
    try {
      const { data, error } = await supabase.functions.invoke('sync-cards-v2', {
        body: { game: selectedGame, setId: selectedSet, forceResync }
      });
      
      if (error) throw error;
      
      toast({
        title: "Cards Sync Started",
        description: data?.message || `Started syncing cards for ${selectedSet}`,
      });
      
      const setName = availableSets.find(s => s.id === selectedSet)?.name || selectedSet;
      setRecentActivity(prev => [`🃏 Cards sync started for ${setName} at ${new Date().toLocaleTimeString()}`, ...prev.slice(0, 3)]);
      
    } catch (error: any) {
      toast({
        title: "Cards Sync Failed",
        description: error.message || "Failed to start cards sync",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, cards: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">JustTCG Sync Dashboard</h1>
          <p className="text-muted-foreground">
            Modern sync system with intelligent duplicate prevention and real-time monitoring
          </p>
        </div>
        <Button 
          onClick={() => {
            fetchSystemHealth();
            fetchAvailableGames();
            if (selectedGame) fetchAvailableSets();
          }}
          variant="outline"
          size="sm"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh All
        </Button>
      </div>

      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Status</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              {systemHealth?.api_status === 'healthy' ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              )}
              <span className="text-2xl font-bold capitalize">
                {systemHealth?.api_status || 'Testing...'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Games</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemHealth?.total_games || 0}</div>
            <p className="text-xs text-muted-foreground">
              Available for sync
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sets</CardTitle>
            <FileText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemHealth?.total_sets || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total sets synced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentActivity.length}</div>
            <p className="text-xs text-muted-foreground">
              Actions today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Interface */}
      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sync">Sync Controls</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="monitor">Job Monitor</TabsTrigger>
        </TabsList>

        {/* Sync Controls */}
        <TabsContent value="sync" className="space-y-6">
          {/* Games Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Games Sync
              </CardTitle>
              <CardDescription>
                Sync all available games from JustTCG API. This updates the master games list and is rarely needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={syncGames}
                disabled={loading.games}
                className="w-full"
              >
                {loading.games ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {loading.games ? 'Syncing Games...' : 'Sync All Games'}
              </Button>
            </CardContent>
          </Card>

          {/* Sets Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Sets Sync
              </CardTitle>
              <CardDescription>
                Sync sets for a specific game. The system will automatically skip recently synced sets to avoid duplicates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedGame} onValueChange={setSelectedGame}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a game..." />
                </SelectTrigger>
                <SelectContent>
                  {availableGames.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Button
                  onClick={() => syncSets(false)}
                  disabled={!selectedGame || loading.sets}
                  className="flex-1"
                >
                  {loading.sets ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Smart Sync Sets
                </Button>
                
                <Button
                  onClick={() => syncSets(true)}
                  disabled={!selectedGame || loading.sets}
                  variant="outline"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Force Resync
                </Button>
              </div>

              {selectedGame && (
                <Alert>
                  <Activity className="w-4 h-4" />
                  <AlertDescription>
                    Smart sync will automatically skip sets that were synced within the last 24 hours. 
                    Use Force Resync to override this behavior.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Cards Sync */}
          {selectedGame && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Cards Sync for {selectedGame}
                </CardTitle>
                <CardDescription>
                  Sync cards and variants for a specific set. Includes batch processing and memory optimization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedSet} onValueChange={setSelectedSet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a set..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSets.map((set) => (
                      <SelectItem key={set.id} value={set.id}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Button
                    onClick={() => syncCards(false)}
                    disabled={!selectedSet || loading.cards}
                    className="flex-1"
                  >
                    {loading.cards ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Sync Cards & Variants
                  </Button>
                  
                  <Button
                    onClick={() => syncCards(true)}
                    disabled={!selectedSet || loading.cards}
                    variant="outline"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Force Sync
                  </Button>
                </div>

                {selectedSet && (
                  <Alert>
                    <CheckCircle className="w-4 h-4" />
                    <AlertDescription>
                      Cards sync includes intelligent batch processing (25 cards per batch) and 
                      automatic memory cleanup for optimal performance on large sets.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Recent Activity */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Live feed of sync operations and system events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivity.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No recent activity. Start a sync operation to see updates here.
                  </div>
                ) : (
                  recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{activity}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Job Monitor */}
        <TabsContent value="monitor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Job Monitor
              </CardTitle>
              <CardDescription>
                Real-time job progress tracking (will be populated once sync_v3 types are available)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Clock className="w-4 h-4" />
                <AlertDescription>
                  Job monitoring will be available once the database types are refreshed. 
                  The sync_v3 schema has been created and is ready for job tracking.
                </AlertDescription>
              </Alert>
              
              <div className="mt-6 space-y-4">
                <div className="text-sm font-medium">Features Coming Online:</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <span>Real-time job progress</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <span>Estimated completion times</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <span>Performance metrics</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-700">
                    <CheckCircle className="w-4 h-4" />
                    <span>Error recovery options</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}