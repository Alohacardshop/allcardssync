import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { 
  Activity, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  Download,
  RefreshCw
} from 'lucide-react'
import { supabase } from "@/integrations/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface MetricData {
  timestamp: string
  cards_per_second: number
  api_response_time: number
  memory_usage_mb: number
  success_rate: number
}

interface ErrorSummary {
  category: string
  count: number
  percentage: number
  color: string
}

export const SyncAnalytics = () => {
  const [metrics, setMetrics] = useState<MetricData[]>([])
  const [errors, setErrors] = useState<ErrorSummary[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      
      // Use mock data for now until types are updated
      const mockMetrics: MetricData[] = [
        {
          timestamp: '12:00',
          cards_per_second: 15,
          api_response_time: 120,
          memory_usage_mb: 180,
          success_rate: 98
        },
        {
          timestamp: '13:00',
          cards_per_second: 18,
          api_response_time: 110,
          memory_usage_mb: 165,
          success_rate: 97
        },
        {
          timestamp: '14:00',
          cards_per_second: 22,
          api_response_time: 95,
          memory_usage_mb: 200,
          success_rate: 99
        }
      ]
      
      const mockErrors: ErrorSummary[] = [
        { category: 'Network', count: 5, percentage: 45, color: '#ef4444' },
        { category: 'API Limit', count: 3, percentage: 27, color: '#f97316' },
        { category: 'Validation', count: 2, percentage: 18, color: '#eab308' },
        { category: 'System', count: 1, percentage: 10, color: '#22c55e' }
      ]

      setMetrics(mockMetrics)
      setErrors(mockErrors)

    } catch (error) {
      console.error('Failed to load analytics:', error)
      toast({
        title: "Failed to load analytics",
        description: "Unable to fetch performance data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const processMetrics = (data: any[]): MetricData[] => {
    // Group by hour and aggregate
    const hourlyData = data.reduce((acc, metric) => {
      const hour = new Date(metric.recorded_at).toISOString().slice(0, 13) + ':00:00.000Z'
      if (!acc[hour]) {
        acc[hour] = {
          timestamp: hour,
          cards_per_second: [],
          api_response_time: [],
          memory_usage_mb: [],
          success_count: 0,
          total_count: 0
        }
      }
      
      const metricData = metric.data
      if (metricData.cards_per_second) acc[hour].cards_per_second.push(metricData.cards_per_second)
      if (metricData.api_response_time) acc[hour].api_response_time.push(metricData.api_response_time)
      if (metricData.memory_usage_mb) acc[hour].memory_usage_mb.push(metricData.memory_usage_mb)
      if (metricData.success) acc[hour].success_count++
      acc[hour].total_count++
      
      return acc
    }, {} as Record<string, any>)

    // Calculate averages
    return Object.values(hourlyData).map((hour: any) => ({
      timestamp: new Date(hour.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      cards_per_second: average(hour.cards_per_second),
      api_response_time: average(hour.api_response_time),
      memory_usage_mb: average(hour.memory_usage_mb),
      success_rate: hour.total_count > 0 ? (hour.success_count / hour.total_count) * 100 : 0
    }))
  }

  const processErrors = (data: any[]): ErrorSummary[] => {
    // Mock error data for now
    return [
      { category: 'Network', count: 5, percentage: 45, color: '#ef4444' },
      { category: 'API Limit', count: 3, percentage: 27, color: '#f97316' },
      { category: 'Validation', count: 2, percentage: 18, color: '#eab308' },
      { category: 'System', count: 1, percentage: 10, color: '#22c55e' }
    ]
  }

  const average = (arr: number[]) => 
    arr.length > 0 ? Math.round(arr.reduce((sum, val) => sum + val, 0) / arr.length) : 0

  const exportData = () => {
    const csvData = metrics.map(metric => 
      `${metric.timestamp},${metric.cards_per_second},${metric.api_response_time},${metric.memory_usage_mb},${metric.success_rate}`
    ).join('\n')
    
    const blob = new Blob([`Timestamp,Cards/Second,API Response Time,Memory Usage (MB),Success Rate\n${csvData}`], 
      { type: 'text/csv' })
    
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sync-analytics-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded mb-2" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Cards/Second</p>
                <p className="text-2xl font-bold">
                  {average(metrics.map(m => m.cards_per_second))}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg API Response</p>
                <p className="text-2xl font-bold">
                  {average(metrics.map(m => m.api_response_time))}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Memory Usage</p>
                <p className="text-2xl font-bold">
                  {average(metrics.map(m => m.memory_usage_mb))}MB
                </p>
              </div>
              <Activity className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">
                  {average(metrics.map(m => m.success_rate))}%
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="performance" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="errors">Error Analysis</TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadAnalytics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportData}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Processing Speed</CardTitle>
                <CardDescription>Cards processed per second over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="cards_per_second" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Response Times</CardTitle>
                <CardDescription>Average response time in milliseconds</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="api_response_time" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Error Distribution</CardTitle>
                <CardDescription>Breakdown of error types (last 7 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={errors}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      label={({ category, percentage }) => `${category}: ${percentage}%`}
                    >
                      {errors.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Error Categories</CardTitle>
                <CardDescription>Detailed error breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {errors.map((error, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: error.color }}
                        />
                        <span className="font-medium">{error.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{error.count} errors</Badge>
                        <span className="text-sm text-muted-foreground">{error.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}