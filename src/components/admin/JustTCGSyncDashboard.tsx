import React, { useState, useEffect, useCallback } from 'react'
import { Database, RefreshCw, Play, Loader2, Calendar, CheckCircle, XCircle, Clock, AlertCircle, Filter, Pause, RotateCcw, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'

interface SyncJob {
  id: string
  job_type: 'games' | 'sets' | 'cards'
  game_slug?: string
  set_id?: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'partial'
  progress: { current: number; total: number }
  error_message?: string
  created_at: string
  started_at?: string
  completed_at?: string
  metadata: any
}

interface GameSet {
  set_id: string
  name: string
  sync_status: 'pending' | 'synced' | 'failed' | 'partial'
  card_count: number
  last_synced_at?: string
}

interface SyncStats {
  totalJobs: number
  completedJobs: number
  failedJobs: number
  totalCardsToday: number
  apiCallsToday: number
  processingRate: number
}

const GAMES = [
  { value: 'mtg', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' }
]

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'completed':
    case 'synced':
      return 'default' // green
    case 'running':
      return 'secondary' // blue
    case 'failed':
      return 'destructive' // red
    case 'partial':
      return 'outline' // orange-ish
    case 'cancelled':
      return 'secondary'
    default:
      return 'outline'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
    case 'synced':
      return CheckCircle
    case 'running':
      return Loader2
    case 'failed':
      return XCircle
    case 'partial':
      return AlertCircle
    case 'cancelled':
      return Pause
    default:
      return Clock
  }
}

// Estimate completion time based on progress and processing rate
const getEstimatedCompletion = (job: SyncJob): string | null => {
  if (job.status !== 'running' || !job.progress?.total || job.progress.current === 0) {
    return null
  }
  
  const processingRate = job.metadata?.processing_rate || 0
  if (processingRate <= 0) return null
  
  const remaining = job.progress.total - job.progress.current
  const estimatedSeconds = remaining / processingRate
  
  if (estimatedSeconds < 60) {
    return `${Math.round(estimatedSeconds)}s`
  } else if (estimatedSeconds < 3600) {
    return `${Math.round(estimatedSeconds / 60)}m`
  } else {
    return `${Math.round(estimatedSeconds / 3600)}h`
  }
}

export default function JustTCGSyncDashboard() {
  const { toast } = useToast()
  
  // State management
  const [selectedGame, setSelectedGame] = useState<string>('')
  const [selectedSet, setSelectedSet] = useState<string>('')
  const [gameSets, setGameSets] = useState<GameSet[]>([])
  const [recentJobs, setRecentJobs] = useState<SyncJob[]>([])
  const [syncStats, setSyncStats] = useState<SyncStats>({
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalCardsToday: 0,
    apiCallsToday: 0,
    processingRate: 0
  })
  
  // Loading states
  const [syncingGames, setSyncingGames] = useState(false)
  const [syncingSets, setSyncingSets] = useState(false)
  const [syncingCards, setSyncingCards] = useState(false)
  const [loadingSets, setLoadingSets] = useState(false)
  const [performingBulkAction, setPerformingBulkAction] = useState(false)
  
  // Filtering states
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('all')
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('all')
  const [searchFilter, setSearchFilter] = useState<string>('')
  
  // Counts
  const [pendingSetsCount, setPendingSetsCount] = useState(0)

  // Fetch recent jobs with filtering
  const fetchRecentJobs = useCallback(async () => {
    try {
      // For now, we'll use mock data. This should be replaced with proper RPC call once created
      const mockJobs: SyncJob[] = []
      
      // Filter jobs based on current filters
      const filteredJobs = mockJobs.filter(job => {
        const statusMatch = jobStatusFilter === 'all' || job.status === jobStatusFilter
        const typeMatch = jobTypeFilter === 'all' || job.job_type === jobTypeFilter
        const searchMatch = searchFilter === '' || 
          job.game_slug?.toLowerCase().includes(searchFilter.toLowerCase()) ||
          job.set_id?.toLowerCase().includes(searchFilter.toLowerCase())
        return statusMatch && typeMatch && searchMatch
      })
      
      setRecentJobs(filteredJobs)
      
      // Calculate sync stats from jobs (mock data for now)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const todayJobs = filteredJobs.filter(job => 
        new Date(job.created_at) >= today
      )
      
      const completedToday = todayJobs.filter(job => job.status === 'completed')
      const failedToday = todayJobs.filter(job => job.status === 'failed')
      
      const totalCardsToday = completedToday.reduce((sum, job) => {
        return sum + (job.metadata?.totalProcessed || job.metadata?.newCards || 0)
      }, 0)
      
      const totalApiCalls = todayJobs.reduce((sum, job) => {
        return sum + (job.metadata?.api_calls || 0)
      }, 0)
      
      const avgProcessingRate = completedToday.reduce((sum, job) => {
        return sum + (job.metadata?.processing_rate || 0)
      }, 0) / (completedToday.length || 1)
      
      setSyncStats({
        totalJobs: todayJobs.length,
        completedJobs: completedToday.length,
        failedJobs: failedToday.length,
        totalCardsToday,
        apiCallsToday: totalApiCalls,
        processingRate: avgProcessingRate
      })
    } catch (error) {
      console.error('Error fetching recent jobs:', error)
    }
  }, [jobStatusFilter, jobTypeFilter, searchFilter])

  // Resume a failed job
  const resumeJob = async (job: SyncJob) => {
    if (!job.metadata?.can_resume) {
      toast({
        title: 'Cannot Resume',
        description: 'This job cannot be resumed',
        variant: 'destructive'
      })
      return
    }

    try {
      let resumeParams: any = {}
      
      if (job.job_type === 'cards') {
        resumeParams = {
          game: job.game_slug,
          setId: job.set_id,
          forceResync: true // Force to continue from where it left off
        }
        
        const { error } = await supabase.functions.invoke('sync-cards', {
          body: resumeParams
        })
        
        if (error) throw error
        
        toast({
          title: 'Job Resumed',
          description: 'Cards sync resumed from previous position'
        })
      } else if (job.job_type === 'sets') {
        resumeParams = { game: job.game_slug }
        
        const { error } = await supabase.functions.invoke('sync-sets', {
          body: resumeParams
        })
        
        if (error) throw error
        
        toast({
          title: 'Job Resumed',
          description: 'Sets sync resumed'
        })
      }
      
      fetchRecentJobs()
    } catch (error) {
      console.error('Error resuming job:', error)
      toast({
        title: 'Resume Failed',
        description: 'Failed to resume sync job',
        variant: 'destructive'
      })
    }
  }

  // Bulk actions
  const cancelAllRunningJobs = async () => {
    setPerformingBulkAction(true)
    try {
      // This would require implementing a cancel endpoint
      toast({
        title: 'Bulk Cancel',
        description: 'Cancel all running jobs feature coming soon'
      })
    } catch (error) {
      console.error('Error cancelling jobs:', error)
      toast({
        title: 'Bulk Cancel Failed',
        description: 'Failed to cancel running jobs',
        variant: 'destructive'
      })
    } finally {
      setPerformingBulkAction(false)
    }
  }

  const retryAllFailedJobs = async () => {
    setPerformingBulkAction(true)
    try {
      const failedJobs = recentJobs.filter(job => 
        job.status === 'failed' || job.status === 'partial'
      )
      
      let retriedCount = 0
      
      for (const job of failedJobs.slice(0, 5)) { // Limit to 5 to prevent overwhelming
        try {
          if (job.job_type === 'games') {
            await supabase.functions.invoke('sync-games')
          } else if (job.job_type === 'sets' && job.game_slug) {
            await supabase.functions.invoke('sync-sets', {
              body: { game: job.game_slug }
            })
          } else if (job.job_type === 'cards' && job.game_slug && job.set_id) {
            await supabase.functions.invoke('sync-cards', {
              body: {
                game: job.game_slug,
                setId: job.set_id,
                forceResync: true
              }
            })
          }
          retriedCount++
          
          // Small delay between retries
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (error) {
          console.error(`Failed to retry job ${job.id}:`, error)
        }
      }
      
      toast({
        title: 'Bulk Retry Complete',
        description: `Retried ${retriedCount} failed jobs`
      })
      
      fetchRecentJobs()
    } catch (error) {
      console.error('Error retrying jobs:', error)
      toast({
        title: 'Bulk Retry Failed',
        description: 'Failed to retry failed jobs',
        variant: 'destructive'
      })
    } finally {
      setPerformingBulkAction(false)
    }
  }
  const fetchGameSets = useCallback(async (game: string) => {
    if (!game) return
    
    setLoadingSets(true)
    try {
      const { data, error } = await supabase.rpc('catalog_v2_browse_sets', {
        game_in: game,
        filter_japanese: false,
        page_in: 1,
        limit_in: 1000
      })

      if (error) throw error
      
      // Type assertion for the returned data
      const responseData = data as { sets: any[], total_count: number }
      const setsData = responseData?.sets || []
      
      const sets: GameSet[] = setsData.map((set: any) => ({
        set_id: set.set_id,
        name: set.name,
        sync_status: 'pending' as const, // Default since browse_sets doesn't include this
        card_count: set.cards_count || 0,
        last_synced_at: set.last_seen_at
      }))
      
      setGameSets(sets)
      
      // Count pending sets (assuming all are pending since we don't have sync_status from browse function)
      setPendingSetsCount(sets.length)
    } catch (error) {
      console.error('Error fetching game sets:', error)
      toast({
        title: 'Error',
        description: 'Failed to fetch sets for selected game',
        variant: 'destructive'
      })
    } finally {
      setLoadingSets(false)
    }
  }, [toast])

  // Sync functions
  const syncAllGames = async () => {
    setSyncingGames(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-games')
      
      if (error) throw error
      
      toast({
        title: 'Games Sync Started',
        description: `Processing ${data.total} games. Job ID: ${data.jobId}`
      })
      
      fetchRecentJobs() // Refresh jobs list
    } catch (error) {
      console.error('Error syncing games:', error)
      toast({
        title: 'Sync Failed',
        description: 'Failed to start games synchronization',
        variant: 'destructive'
      })
    } finally {
      setSyncingGames(false)
    }
  }

  const syncSetsForGame = async () => {
    if (!selectedGame) return
    
    setSyncingSets(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-sets', {
        body: { game: selectedGame }
      })
      
      if (error) throw error
      
      toast({
        title: 'Sets Sync Started',
        description: `New sets: ${data.newSets}, Updated: ${data.updatedSets}`
      })
      
      fetchRecentJobs()
      fetchGameSets(selectedGame) // Refresh sets list
    } catch (error) {
      console.error('Error syncing sets:', error)
      toast({
        title: 'Sync Failed',
        description: 'Failed to synchronize sets',
        variant: 'destructive'
      })
    } finally {
      setSyncingSets(false)
    }
  }

  const syncCards = async (setId?: string, forceResync = false) => {
    if (!selectedGame) return
    
    setSyncingCards(true)
    try {
      const body: any = { game: selectedGame }
      if (setId) body.setId = setId
      if (forceResync) body.forceResync = true
      
      const { data, error } = await supabase.functions.invoke('sync-cards', { body })
      
      if (error) throw error
      
      if (data.skipped) {
        toast({
          title: 'Sync Skipped',
          description: 'Set already synchronized'
        })
      } else {
        toast({
          title: 'Cards Sync Started',
          description: `New cards: ${data.newCards}, Updated: ${data.updatedCards}`
        })
      }
      
      fetchRecentJobs()
      fetchGameSets(selectedGame) // Refresh sets list
    } catch (error) {
      console.error('Error syncing cards:', error)
      toast({
        title: 'Sync Failed',
        description: 'Failed to synchronize cards',
        variant: 'destructive'
      })
    } finally {
      setSyncingCards(false)
    }
  }

  const syncAllPendingSets = async () => {
    if (!selectedGame) return
    
    const pendingSets = gameSets.filter(set => set.sync_status !== 'synced')
    
    for (const set of pendingSets) {
      await syncCards(set.set_id)
      // Small delay between requests to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  // Effects
  useEffect(() => {
    fetchRecentJobs()
    
    // Set up real-time subscription - using a polling approach since catalog_v2 tables might not be in realtime
    const interval = setInterval(() => {
      fetchRecentJobs()
    }, 5000) // Poll every 5 seconds

    return () => {
      clearInterval(interval)
    }
  }, [fetchRecentJobs])

  useEffect(() => {
    if (selectedGame) {
      fetchGameSets(selectedGame)
      setSelectedSet('') // Reset set selection when game changes
    } else {
      setGameSets([])
      setPendingSetsCount(0)
    }
  }, [selectedGame, fetchGameSets])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">JustTCG Sync Dashboard</h1>
        <Button 
          onClick={fetchRecentJobs} 
          variant="outline" 
          size="sm"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Sync Statistics Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jobs Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{syncStats.totalJobs}</div>
            <p className="text-xs text-muted-foreground">
              {syncStats.completedJobs} completed, {syncStats.failedJobs} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cards Synced</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{syncStats.totalCardsToday.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {syncStats.processingRate > 0 && `${syncStats.processingRate.toFixed(1)}/sec avg`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{syncStats.apiCallsToday}</div>
            <p className="text-xs text-muted-foreground">
              To JustTCG API today
            </p>
          </CardContent>
        </Card>

        {/* Bulk Actions Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bulk Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={cancelAllRunningJobs}
              disabled={performingBulkAction || !recentJobs.some(job => job.status === 'running')}
            >
              {performingBulkAction && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Cancel Running
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={retryAllFailedJobs}
              disabled={performingBulkAction || !recentJobs.some(job => job.status === 'failed' || job.status === 'partial')}
            >
              {performingBulkAction && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Retry Failed
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Games Sync Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Games Sync
            </CardTitle>
            <CardDescription>
              Synchronize all available games from JustTCG API
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={syncAllGames} 
              disabled={syncingGames}
              className="w-full"
            >
              {syncingGames && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sync All Games
            </Button>
          </CardContent>
        </Card>

        {/* Sets Sync Section */}
        <Card>
          <CardHeader>
            <CardTitle>Sets Sync</CardTitle>
            <CardDescription>
              Synchronize card sets for a specific game
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedGame} onValueChange={setSelectedGame}>
              <SelectTrigger>
                <SelectValue placeholder="Select a game..." />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-md z-50">
                {GAMES.map((game) => (
                  <SelectItem key={game.value} value={game.value}>
                    {game.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={syncSetsForGame}
              disabled={!selectedGame || syncingSets}
              className="w-full"
            >
              {syncingSets && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sync Sets for {GAMES.find(g => g.value === selectedGame)?.label || 'Game'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cards Sync Section - Only show when game is selected */}
      {selectedGame && (
        <Card>
          <CardHeader>
            <CardTitle>
              Cards Sync for {GAMES.find(g => g.value === selectedGame)?.label}
            </CardTitle>
            <CardDescription>
              Synchronize cards and variants for individual sets
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Set Selector */}
            <Select value={selectedSet} onValueChange={setSelectedSet}>
              <SelectTrigger>
                <SelectValue placeholder="Select a specific set (optional)..." />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-md z-50">
                {gameSets.map((set) => (
                  <SelectItem key={set.set_id} value={set.set_id}>
                    {set.name} - {set.sync_status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => syncCards(selectedSet)}
                disabled={!selectedSet || syncingCards}
                variant="default"
              >
                {syncingCards && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sync Selected Set
              </Button>
              
              <Button
                onClick={() => syncCards(selectedSet, true)}
                disabled={!selectedSet || syncingCards}
                variant="secondary"
              >
                Force Resync
              </Button>
              
              <Button
                onClick={syncAllPendingSets}
                disabled={pendingSetsCount === 0 || syncingCards}
                variant="outline"
              >
                <Play className="h-4 w-4 mr-2" />
                Sync All Pending Sets ({pendingSetsCount})
              </Button>
            </div>

            {/* Sets Table */}
            {loadingSets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="rounded-md border">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Set Name</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Cards</th>
                        <th className="text-left p-2 font-medium">Last Synced</th>
                        <th className="text-left p-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gameSets.map((set) => {
                        const StatusIcon = getStatusIcon(set.sync_status)
                        return (
                          <tr key={set.set_id} className="border-b">
                            <td className="p-2 font-medium">{set.name}</td>
                            <td className="p-2">
                              <Badge variant={getStatusBadgeVariant(set.sync_status)} className="flex items-center gap-1 w-fit">
                                <StatusIcon className="h-3 w-3" />
                                {set.sync_status}
                              </Badge>
                            </td>
                            <td className="p-2">{set.card_count}</td>
                            <td className="p-2">
                              {set.last_synced_at ? (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {format(new Date(set.last_synced_at), 'MMM d, yyyy HH:mm')}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Never</span>
                              )}
                            </td>
                            <td className="p-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => syncCards(set.set_id)}
                                disabled={syncingCards}
                              >
                                <RefreshCw className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs Section with Filtering */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Sync Jobs</CardTitle>
              <CardDescription>
                Real-time job monitoring with filtering and bulk actions
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                </SelectContent>
              </Select>
              <Select value={jobTypeFilter} onValueChange={setJobTypeFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="games">Games</SelectItem>
                  <SelectItem value="sets">Sets</SelectItem>
                  <SelectItem value="cards">Cards</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-32"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentJobs.map((job) => {
              const StatusIcon = getStatusIcon(job.status)
              const progress = job.progress?.total > 0 ? (job.progress.current / job.progress.total) * 100 : 0
              const estimatedCompletion = getEstimatedCompletion(job)
              const canResume = job.status === 'failed' || job.status === 'partial'
              
              return (
                <div key={job.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(job.status)} className="flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {job.status}
                      </Badge>
                      <span className="font-medium">
                        {job.job_type} {job.game_slug && `• ${job.game_slug}`} {job.set_id && `• ${job.set_id}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canResume && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resumeJob(job)}
                          className="h-7"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      )}
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(job.created_at), 'MMM d, HH:mm')}
                      </div>
                    </div>
                  </div>
                  
                  {job.status === 'running' && job.progress?.total > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <div className="flex items-center gap-2">
                          <span>{job.progress.current}/{job.progress.total}</span>
                          {estimatedCompletion && (
                            <span className="text-muted-foreground">• ETA: {estimatedCompletion}</span>
                          )}
                        </div>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}
                  
                  {job.error_message && (
                    <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      <div className="font-medium">Error:</div>
                      <div>{job.error_message}</div>
                      {job.metadata?.error_suggestions && (
                        <div className="mt-1 text-xs">
                          <strong>Suggestion:</strong> {job.metadata.error_suggestions}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {job.metadata && job.status === 'completed' && (
                    <div className="text-sm text-muted-foreground grid grid-cols-2 gap-2">
                      {job.metadata.processing_rate && (
                        <div>Rate: {job.metadata.processing_rate.toFixed(1)}/sec</div>
                      )}
                      {job.metadata.total_duration_ms && (
                        <div>Duration: {(job.metadata.total_duration_ms / 1000).toFixed(1)}s</div>
                      )}
                      {job.metadata.api_calls && (
                        <div>API calls: {job.metadata.api_calls}</div>
                      )}
                      {job.metadata.newCards && (
                        <div>New cards: {job.metadata.newCards}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            
            {recentJobs.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No sync jobs found matching current filters
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}