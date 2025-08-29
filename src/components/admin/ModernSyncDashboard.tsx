import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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

interface SyncJob {
  id: string;
  job_type: 'games' | 'sets' | 'cards';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  source: string;
  game?: string;
  set_id?: string;
  total_items: number;
  processed_items: number;
  progress_percentage: number;
  items_per_second?: number;
  estimated_completion_at?: string;
  error_message?: string;
  results?: any;
  metrics?: any;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface SystemHealth {
  api_status: 'healthy' | 'degraded' | 'down';
  last_games_sync?: string;
  total_games: number;
  total_sets: number;
  total_cards: number;
  jobs_today: number;
  avg_job_duration: number;
}

export function ModernSyncDashboard() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [availableGames, setAvailableGames] = useState<any[]>([]);
  const [availableSets, setAvailableSets] = useState<any[]>([]);
  const [loading, setLoading] = useState({
    games: false,
    sets: false,
    cards: false,
    health: false
  });

  // Real-time job updates
  useEffect(() => {
    fetchJobs();
    fetchSystemHealth();
    fetchAvailableGames();

      // Subscribe to job changes (disabled for now since sync_v3 not in types)
      // const jobsChannel = supabase
      //   .channel('sync-jobs-changes')
      //   .on('postgres_changes', 
      //     { 
      //       event: '*', 
      //       schema: 'sync_v3', 
      //       table: 'jobs' 
      //     }, 
      //     (payload) => {
      //       console.log('Job update:', payload);
      //       fetchJobs();
      //     }
      //   )
      //   .subscribe();

    return () => {
      // Clean up when component unmounts
    };
  }, []);

  // Fetch available sets when game changes
  useEffect(() => {
    if (selectedGame) {
      fetchAvailableSets();
    } else {
      setAvailableSets([]);
      setSelectedSet('');
    }
  }, [selectedGame]);

  const fetchJobs = async () => {
    try {
      // Use RPC to fetch jobs since sync_v3 schema is not in types yet
      const { data, error } = await supabase.rpc('get_recent_sync_jobs', {
        limit_count: 20
      });

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      // Fallback to mock data for now
      setJobs([]);
    }
  };

  const fetchSystemHealth = async () => {
    setLoading(prev => ({ ...prev, health: true }));
    try {
      // Get system statistics
      const [gamesRes, setsRes] = await Promise.all([
        supabase.from('games').select('*', { count: 'exact', head: true }),
        supabase.from('sets').select('*', { count: 'exact', head: true })
      ]);

      // Get recent jobs through RPC
      const { data: jobsData } = await supabase.rpc('get_recent_sync_jobs', {
        limit_count: 100
      }) || { data: [] };

      // Test API health
      const healthResponse = await supabase.functions.invoke('justtcg-health');
      
      setSystemHealth({
        api_status: healthResponse.error ? 'down' : 'healthy',
        total_games: gamesRes.count || 0,
        total_sets: setsRes.count || 0,
        total_cards: 0, // TODO: Add cards count
        jobs_today: jobsData?.length || 0,
        avg_job_duration: calculateAvgJobDuration(jobsData || [])
      });
    } catch (error) {
      console.error('Error fetching system health:', error);
      setSystemHealth({
        api_status: 'down',
        total_games: 0,
        total_sets: 0,
        total_cards: 0,
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
        .select('*')
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
        .select('*')
        .eq('game', selectedGame)
        .order('name')
        .limit(100);

      if (error) throw error;
      setAvailableSets(data || []);
    } catch (error) {
      console.error('Error fetching sets:', error);
    }
  };

  const calculateAvgJobDuration = (jobs: any[]) => {
    const completedJobs = jobs.filter(job => 
      job.status === 'completed' && job.started_at && job.completed_at
    );
    
    if (completedJobs.length === 0) return 0;
    
    const totalDuration = completedJobs.reduce((sum, job) => {
      return sum + (new Date(job.completed_at).getTime() - new Date(job.started_at).getTime());
    }, 0);
    
    return Math.round(totalDuration / completedJobs.length / 1000); // seconds
  };

  const syncGames = async () => {
    setLoading(prev => ({ ...prev, games: true }));
    try {
      const { data, error } = await supabase.functions.invoke('sync-games-v2');
      
      if (error) throw error;
      
      toast({
        title: "Games Sync Started",
        description: `Job ${data.job_id} created successfully`,
      });
      
      fetchJobs();
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
        description: data.message || `Started syncing sets for ${selectedGame}`,
      });
      
      fetchJobs();
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
        description: data.message || `Started syncing cards for ${selectedSet}`,
      });
      
      fetchJobs();
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

  const cancelJob = async (jobId: string) => {
    try {
      // Use RPC function to cancel job
      const { error } = await supabase.rpc('cancel_sync_job', {
        job_id: jobId
      });

      if (error) throw error;

      toast({
        title: "Job Cancelled",
        description: "Sync job has been cancelled",
      });

      fetchJobs();
    } catch (error: any) {
      toast({
        title: "Failed to Cancel Job",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getJobStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      queued: { variant: "secondary", icon: Clock },
      running: { variant: "default", icon: Play },
      completed: { variant: "default", icon: CheckCircle },
      failed: { variant: "destructive", icon: AlertTriangle },
      cancelled: { variant: "outline", icon: Square }
    };

    const config = variants[status] || variants.queued;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatETA = (etaString?: string) => {
    if (!etaString) return 'Unknown';
    
    const eta = new Date(etaString);
    const now = new Date();
    const diffMs = eta.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Soon';
    
    return formatDuration(diffMs);
  };

  const runningJobs = jobs.filter(job => job.status === 'running');
  const hasRunningGameSync = runningJobs.some(job => job.job_type === 'games');
  const hasRunningSetSync = runningJobs.some(job => 
    job.job_type === 'sets' && job.game === selectedGame
  );
  const hasRunningCardSync = runningJobs.some(job => 
    job.job_type === 'cards' && job.game === selectedGame && job.set_id === selectedSet
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">JustTCG Sync Dashboard</h1>
          <p className="text-muted-foreground">
            Modern sync system with real-time monitoring and smart controls
          </p>
        </div>
        <Button 
          onClick={() => {
            fetchJobs();
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
                {systemHealth?.api_status || 'Unknown'}
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
            <CardTitle className="text-sm font-medium">Jobs Today</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{systemHealth?.jobs_today || 0}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {systemHealth?.avg_job_duration || 0}s
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Interface */}
      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sync">Sync Controls</TabsTrigger>
          <TabsTrigger value="monitor">Job Monitor</TabsTrigger>
          <TabsTrigger value="sets">Sets Management</TabsTrigger>
        </TabsList>

        {/* Sync Controls */}
        <TabsContent value="sync" className="space-y-4">
          {/* Games Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Games Sync
              </CardTitle>
              <CardDescription>
                Sync all available games from JustTCG API (rarely needed)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={syncGames}
                disabled={loading.games || hasRunningGameSync}
                className="w-full"
              >
                {loading.games ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                {hasRunningGameSync ? 'Games Sync Running...' : 'Sync All Games'}
              </Button>
              
              {hasRunningGameSync && (
                <Alert className="mt-4">
                  <Activity className="w-4 h-4" />
                  <AlertDescription>
                    Games sync is currently running. Check the Job Monitor for progress.
                  </AlertDescription>
                </Alert>
              )}
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
                Sync sets for a specific game with smart duplicate prevention
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
                  disabled={!selectedGame || loading.sets || hasRunningSetSync}
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
                  disabled={!selectedGame || loading.sets || hasRunningSetSync}
                  variant="outline"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Force Resync
                </Button>
              </div>

              {hasRunningSetSync && (
                <Alert className="mt-4">
                  <Activity className="w-4 h-4" />
                  <AlertDescription>
                    Sets sync is running for {selectedGame}. Duplicate syncs are prevented.
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
                  Sync cards and variants for a specific set
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedSet} onValueChange={setSelectedSet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a set..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSets.map((set) => (
                      <SelectItem key={set.provider_id} value={set.provider_id}>
                        {set.name} ({set.sync_status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Button
                    onClick={() => syncCards(false)}
                    disabled={!selectedSet || loading.cards || hasRunningCardSync}
                    className="flex-1"
                  >
                    {loading.cards ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4 mr-2" />
                    )}
                    Sync Cards
                  </Button>
                  
                  <Button
                    onClick={() => syncCards(true)}
                    disabled={!selectedSet || loading.cards || hasRunningCardSync}
                    variant="outline"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Force Sync
                  </Button>
                </div>

                {hasRunningCardSync && (
                  <Alert className="mt-4">
                    <Activity className="w-4 h-4" />
                    <AlertDescription>
                      Cards sync is running for this set. Please wait for completion.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Job Monitor */}
        <TabsContent value="monitor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Real-time Job Monitor
              </CardTitle>
              <CardDescription>
                Monitor sync jobs with live progress updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {jobs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No sync jobs found. Start a sync operation to see jobs here.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <Card key={job.id} className="border-l-4 border-l-primary">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getJobStatusBadge(job.status)}
                            <span className="font-medium">
                              {job.job_type.toUpperCase()} 
                              {job.game && ` - ${job.game}`}
                              {job.set_id && ` - ${job.set_id}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            {new Date(job.created_at).toLocaleString()}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {job.status === 'running' && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span>Progress: {job.processed_items} / {job.total_items}</span>
                              <span>{job.progress_percentage}%</span>
                            </div>
                            <Progress value={job.progress_percentage} className="w-full" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>
                                {job.items_per_second ? 
                                  `${job.items_per_second.toFixed(1)} items/sec` : 
                                  'Calculating speed...'
                                }
                              </span>
                              <span>ETA: {formatETA(job.estimated_completion_at)}</span>
                            </div>
                            <Button
                              onClick={() => cancelJob(job.id)}
                              variant="outline"
                              size="sm"
                              className="mt-2"
                            >
                              <Square className="w-4 h-4 mr-2" />
                              Cancel Job
                            </Button>
                          </div>
                        )}

                        {job.status === 'failed' && job.error_message && (
                          <Alert variant="destructive">
                            <AlertTriangle className="w-4 h-4" />
                            <AlertDescription>{job.error_message}</AlertDescription>
                          </Alert>
                        )}

                        {job.status === 'completed' && job.results && (
                          <div className="text-sm text-muted-foreground">
                            <p>✅ Completed successfully</p>
                            {job.results.total && (
                              <p>Processed: {job.results.processed || job.results.processed_games || job.results.processed_sets || job.results.processed_cards} items</p>
                            )}
                            {job.metrics?.duration_ms && (
                              <p>Duration: {formatDuration(job.metrics.duration_ms)}</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sets Management */}
        <TabsContent value="sets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Sets Management
              </CardTitle>
              <CardDescription>
                Manage and monitor sets sync status across all games
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Sets management interface coming soon...
                <br />
                Use the Sync Controls tab for now.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}