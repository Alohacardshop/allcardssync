import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"
import { 
  Heart, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  RefreshCw,
  Trash2
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshButton } from '@/components/RefreshButton'
import { logger } from '@/lib/logger';

interface HealthMetrics {
  lastProcessorRun?: string
  processorStatus: 'healthy' | 'warning' | 'critical'
  failureRate: number
  avgProcessingTime: number
  queueBacklog: number
  totalItems: number
  rateLimitStatus: 'normal' | 'elevated' | 'critical'
  healthScore: number
}

async function checkHealth(): Promise<HealthMetrics> {
  // Get queue stats
  const { data: queueItems, error: queueError } = await supabase
    .from('shopify_sync_queue')
    .select('*')

  if (queueError) throw queueError

  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const allItems = queueItems || []
  
  // Calculate metrics
  const queued = allItems.filter(item => item.status === 'queued').length
  const processing = allItems.filter(item => item.status === 'processing').length
  const completed = allItems.filter(item => item.status === 'completed').length
  const failed = allItems.filter(item => item.status === 'failed').length

  // Find last successful processing
  const lastCompleted = allItems
    .filter(item => item.status === 'completed' && item.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0]

  // Calculate failure rate
  const totalProcessed = completed + failed
  const failureRate = totalProcessed > 0 ? (failed / totalProcessed) * 100 : 0

  // Calculate processing times
  const completedWithTimes = allItems.filter(item => 
    item.status === 'completed' && item.started_at && item.completed_at
  )
  
  const processingTimes = completedWithTimes.map(item => 
    new Date(item.completed_at!).getTime() - new Date(item.started_at!).getTime()
  )
  
  const avgProcessingTime = processingTimes.length > 0 
    ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length / 1000
    : 0

  // Determine processor status
  let processorStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (!lastCompleted) {
    processorStatus = 'warning'
  } else {
    const timeSinceLastRun = now.getTime() - new Date(lastCompleted.completed_at!).getTime()
    const minutesSinceLastRun = timeSinceLastRun / (1000 * 60)
    
    if (minutesSinceLastRun > 60) {
      processorStatus = 'critical'
    } else if (minutesSinceLastRun > 15) {
      processorStatus = 'warning'
    }
  }

  // Calculate health score
  let healthScore = 100
  if (failureRate > 20) healthScore -= 30
  else if (failureRate > 10) healthScore -= 15
  
  if (processorStatus === 'critical') healthScore -= 40
  else if (processorStatus === 'warning') healthScore -= 20
  
  if (queued > 100) healthScore -= 20
  else if (queued > 50) healthScore -= 10

  return {
    lastProcessorRun: lastCompleted?.completed_at,
    processorStatus,
    failureRate: Math.round(failureRate * 10) / 10,
    avgProcessingTime: Math.round(avgProcessingTime * 10) / 10,
    queueBacklog: queued,
    totalItems: allItems.length,
    rateLimitStatus: failureRate > 15 ? 'elevated' : 'normal',
    healthScore: Math.max(0, healthScore)
  }
}

export default function ShopifyQueueHealth() {
  const queryClient = useQueryClient()
  
  const { data: health, isLoading } = useQuery({
    queryKey: ['shopify-queue-health'],
    queryFn: checkHealth,
    refetchOnWindowFocus: true,
    // Only poll when health score is low (< 80)
    refetchInterval: (query) => {
      const data = query.state.data as HealthMetrics | undefined
      return data && data.healthScore < 80 ? 30000 : false // Poll every 30s only if unhealthy
    }
  })

  const runCleanup = async () => {
    try {
      // Delete completed items older than 7 days
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { error } = await supabase
        .from('shopify_sync_queue')
        .delete()
        .eq('status', 'completed')
        .lt('completed_at', sevenDaysAgo.toISOString())

      if (error) throw error

      toast.success('Queue cleanup completed')
      queryClient.invalidateQueries({ queryKey: ['shopify-queue-health'] })
    } catch (error) {
      logger.error('Error running cleanup', error instanceof Error ? error : new Error(String(error)), undefined, 'shopify-queue-health');
      toast.error('Failed to run cleanup')
    }
  }

  const getHealthBadge = (status: string, score?: number) => {
    if (score !== undefined) {
      if (score >= 80) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>
      if (score >= 60) return <Badge className="bg-yellow-100 text-yellow-800">Good</Badge>
      if (score >= 40) return <Badge className="bg-orange-100 text-orange-800">Fair</Badge>
      return <Badge className="bg-red-100 text-red-800">Poor</Badge>
    }

    switch (status) {
      case 'healthy': return <Badge className="bg-green-100 text-green-800">Healthy</Badge>
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>
      case 'critical': return <Badge className="bg-red-100 text-red-800">Critical</Badge>
      case 'normal': return <Badge className="bg-green-100 text-green-800">Normal</Badge>
      case 'elevated': return <Badge className="bg-yellow-100 text-yellow-800">Elevated</Badge>
      default: return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (isLoading || !health) {
    return <div className="text-center py-4">Checking queue health...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Heart className="w-5 h-5 text-red-500" />
            Queue Health Monitor
          </h3>
          <p className="text-sm text-muted-foreground">
            Real-time monitoring of Shopify sync queue performance
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton queryKey={['shopify-queue-health']} />
          <Button variant="outline" size="sm" onClick={runCleanup}>
            <Trash2 className="w-4 h-4 mr-2" />
            Cleanup
          </Button>
        </div>
      </div>

      {/* Overall Health Score */}
      <Card className={health.healthScore < 60 ? 'border-red-200 bg-red-50' : health.healthScore < 80 ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Overall Health Score</span>
            {getHealthBadge('', health.healthScore)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress 
              value={health.healthScore} 
              className={`h-3 ${health.healthScore < 60 ? '[&>div]:bg-red-500' : health.healthScore < 80 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500'}`}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Health Score</span>
              <span>{health.healthScore}/100</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Health Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className={`w-4 h-4 ${health.processorStatus === 'healthy' ? 'text-green-500' : health.processorStatus === 'warning' ? 'text-yellow-500' : 'text-red-500'}`} />
              Processor Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {getHealthBadge(health.processorStatus)}
              {health.lastProcessorRun && (
                <p className="text-xs text-muted-foreground">
                  Last run: {formatDistanceToNow(new Date(health.lastProcessorRun), { addSuffix: true })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              Failure Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-red-600">{health.failureRate}%</div>
              <Progress 
                value={Math.min(health.failureRate, 50)} 
                className="h-2 [&>div]:bg-red-500"
              />
              <p className="text-xs text-muted-foreground">
                {health.failureRate > 10 ? 'Needs attention' : 'Within normal range'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Avg Processing Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">{health.avgProcessingTime}s</div>
              <p className="text-xs text-muted-foreground">
                {health.avgProcessingTime > 30 ? 'Slower than expected' : 'Good performance'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500" />
              Queue Backlog
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-orange-600">{health.queueBacklog}</div>
              <p className="text-xs text-muted-foreground">
                {health.queueBacklog > 50 ? 'High backlog' : 'Normal levels'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Alerts */}
      {(health.processorStatus !== 'healthy' || health.failureRate > 10 || health.queueBacklog > 100) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              Health Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {health.processorStatus === 'critical' && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" />
                  <span>Processor hasn't run in over 1 hour - check system status</span>
                </div>
              )}
              {health.processorStatus === 'warning' && (
                <div className="flex items-center gap-2 text-yellow-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Processor last ran over 15 minutes ago</span>
                </div>
              )}
              {health.failureRate > 20 && (
                <div className="flex items-center gap-2 text-red-700">
                  <XCircle className="w-4 h-4" />
                  <span>High failure rate ({health.failureRate}%) - investigate error patterns</span>
                </div>
              )}
              {health.failureRate > 10 && health.failureRate <= 20 && (
                <div className="flex items-center gap-2 text-yellow-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Elevated failure rate ({health.failureRate}%) - monitor closely</span>
                </div>
              )}
              {health.queueBacklog > 100 && (
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Large queue backlog ({health.queueBacklog} items) - consider processing</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rate Limit Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>API Rate Limit Status</span>
            {getHealthBadge(health.rateLimitStatus)}
          </CardTitle>
          <CardDescription>
            Monitor Shopify API usage to prevent rate limiting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {health.rateLimitStatus === 'normal' 
                ? 'API usage is within normal limits' 
                : 'Elevated API usage - the processor will automatically adjust delays'
              }
            </p>
            {health.rateLimitStatus === 'elevated' && (
              <div className="text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
                The system has detected elevated API usage and will automatically slow down processing to prevent rate limits.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
