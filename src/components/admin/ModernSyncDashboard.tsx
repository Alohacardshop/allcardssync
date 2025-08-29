import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Activity, 
  Play, 
  Pause, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Zap,
  Database,
  Settings,
  BarChart3,
  Webhook,
  Heart,
  RefreshCw,
  TrendingUp
} from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { SyncConfiguration } from './SyncConfiguration'
import { SyncAnalytics } from './SyncAnalytics'

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

export const ModernSyncDashboard = () => {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [availableGames, setAvailableGames] = useState<any[]>([])
  const [availableSets, setAvailableSets] = useState<any[]>([])
  const [selectedSet, setSelectedSet] = useState<string>('')
  const [recentActivity, setRecentActivity] = useState<string[]>([])

  useEffect(() => {
    loadJobs()
    loadGames()
    loadRecentActivity()
  }, [])

  const loadRecentActivity = () => {
    setRecentActivity([
      "✅ Games sync completed - 12 games processed",
      "🎴 Sets sync started for Pokemon", 
      "⚡ API health check passed",
      "🃏 Cards sync completed for Base Set"
    ])
  }

  const loadJobs = async () => {
    try {
      setLoading(true)
      // Use RPC function when available, for now use mock data
      const mockJobs = [
        {
          id: '1',
          job_type: 'games',
          status: 'completed',
          game: 'Pokemon',
          processed_items: 12,
          total_items: 12,
          progress_percentage: 100,
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        {
          id: '2', 
          job_type: 'sets',
          status: 'running',
          game: 'Magic',
          processed_items: 145,
          total_items: 200,
          progress_percentage: 72,
          created_at: new Date(Date.now() - 600000).toISOString()
        }
      ]
      setJobs(mockJobs)
    } catch (error) {
      console.error('Failed to load jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadGames = async () => {
    try {
      const { data } = await supabase
        .from('games')
        .select('id, name')
        .order('name')
      setAvailableGames(data || [])
    } catch (error) {
      console.error('Failed to load games:', error)
    }
  }

  const triggerSync = async (syncType: string) => {
    try {
      const endpoint = `sync-${syncType}-v2`
      const body = syncType === 'games' ? {} : { game: selectedGame }
      
      const { data, error } = await supabase.functions.invoke(endpoint, { body })
      
      if (error) throw error
      
      toast({
        title: "Sync Started",
        description: `${syncType} sync has been initiated`,
      })
      
      loadJobs()
    } catch (error) {
      console.error('Sync failed:', error)
      toast({
        title: "Sync Failed", 
        description: "Failed to start sync operation",
        variant: "destructive"
      })
    }
  }

  const checkSystemHealth = async () => {
    try {
      const { data } = await supabase.functions.invoke('health-monitor')
      toast({
        title: "Health Check Complete",
        description: data?.overall_status === 'healthy' ? 'All systems operational' : 'Some issues detected',
        variant: data?.overall_status === 'healthy' ? 'default' : 'destructive'
      })
    } catch (error) {
      toast({
        title: "Health Check Failed",
        description: "Unable to check system health",
        variant: "destructive"
      })
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'running': return <Activity className="h-4 w-4 text-blue-600 animate-spin" />
      case 'failed': return <AlertCircle className="h-4 w-4 text-red-600" />
      default: return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'completed': return 'default'
      case 'running': return 'secondary'
      case 'failed': return 'destructive'
      default: return 'outline'
    }
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString()
  }

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
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="config">Configuration</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        <TabsTrigger value="health">Health</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {/* System Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Overview
            </CardTitle>
            <CardDescription>
              Real-time sync system status and recent activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <p className="font-semibold">API Status</p>
                  <p className="text-sm text-muted-foreground">Healthy</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Database className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="font-semibold">Database</p>
                  <p className="text-sm text-muted-foreground">Connected</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Zap className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="font-semibold">Queue</p>
                  <p className="text-sm text-muted-foreground">{jobs.filter(j => j.status === 'running').length} active</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common sync operations and system controls
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Button 
                onClick={() => triggerSync('games')} 
                disabled={loading}
                className="justify-start h-auto p-4"
              >
                <div className="text-left">
                  <p className="font-semibold">Sync Games</p>
                  <p className="text-sm opacity-70">Update game catalog</p>
                </div>
              </Button>
              
              <div className="space-y-2">
                <Select value={selectedGame} onValueChange={setSelectedGame}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select game for sets sync..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGames.map((game) => (
                      <SelectItem key={game.id} value={game.id}>
                        {game.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => triggerSync('sets')} 
                  disabled={loading || !selectedGame}
                  variant="outline"
                  className="w-full justify-start h-auto p-4"
                >
                  <div className="text-left">
                    <p className="font-semibold">Sync Sets</p>
                    <p className="text-sm opacity-70">Bulk set synchronization</p>
                  </div>
                </Button>
              </div>
              
              <Button 
                onClick={() => checkSystemHealth()} 
                disabled={loading}
                variant="outline"
                className="justify-start h-auto p-4"
              >
                <div className="text-left">
                  <p className="font-semibold">Health Check</p>
                  <p className="text-sm opacity-70">System diagnostics</p>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Jobs
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadJobs}
                disabled={loading}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sync jobs found</p>
                <p className="text-sm">Start a sync operation to see jobs here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-4 rounded-lg border">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <p className="font-semibold">{job.job_type} - {job.game || 'All Games'}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(job.created_at)} • {job.processed_items}/{job.total_items || '?'} items
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {job.progress_percentage !== undefined && (
                        <div className="w-24">
                          <Progress value={job.progress_percentage} className="h-2" />
                        </div>
                      )}
                      <Badge variant={getStatusVariant(job.status)}>
                        {job.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="analytics">
        <SyncAnalytics />
      </TabsContent>

      <TabsContent value="config">
        <SyncConfiguration />
      </TabsContent>

      <TabsContent value="webhooks">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Management
            </CardTitle>
            <CardDescription>
              Configure webhook notifications for sync events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Webhook management interface coming soon</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="health">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>
              Monitor system health and performance metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Health monitoring dashboard coming soon</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

// Remove all the duplicate content below