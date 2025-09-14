import { useState, useEffect } from "react"
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from "recharts"
import { 
  Download, 
  TrendingUp, 
  Package, 
  DollarSign,
  Calendar,
  Target
} from "lucide-react"
import { toast } from "sonner"

interface ChartDataPoint {
  count: number;
  value: number;
  name?: string;
  [key: string]: any;
}

interface ConditionData {
  condition: string;
  count: number;
  percentage: number;
  color: string;
}

interface GameData {
  game: string;
  count: number;
  value: number;
  color: string;
}

// Type guards and safe operations
const isNumber = (value: unknown): value is number => {
  return typeof value === 'number' && !isNaN(value);
}

const safeAdd = (a: unknown, b: unknown): number => {
  const numA = isNumber(a) ? a : 0;
  const numB = isNumber(b) ? b : 0;
  return numA + numB;
}

const safeMultiply = (a: unknown, b: unknown): number => {
  const numA = isNumber(a) ? a : 0;
  const numB = isNumber(b) ? b : 0;
  return numA * numB;
}

interface AnalyticsData {
  inventoryTrends: Array<{
    date: string
    totalValue: number
    totalItems: number
    avgPrice: number
  }>
  conditionDistribution: Array<{
    condition: string
    count: number
    percentage: number
    color: string
  }>
  gameDistribution: Array<{
    game: string
    count: number
    value: number
    color: string
  }>
  priceRanges: Array<{
    range: string
    count: number
    totalValue: number
  }>
  setCompletion: Array<{
    setName: string
    totalCards: number
    ownedCards: number
    completionRate: number
    value: number
  }>
  monthlyRevenue: Array<{
    month: string
    revenue: number
    profit: number
    itemsSold: number
  }>
}

const CONDITION_COLORS = {
  'Mint': '#10b981',
  'Near Mint': '#3b82f6', 
  'Excellent': '#8b5cf6',
  'Good': '#f59e0b',
  'Played': '#ef4444',
  'Poor': '#6b7280'
}

const GAME_COLORS = {
  'pokemon': '#ffcb05',
  'yugioh': '#4c1d95',
  'mtg': '#f97316',
  'dragonball': '#dc2626',
  'other': '#6b7280'
}

export function InventoryAnalytics() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30d')
  const [selectedGame, setSelectedGame] = useState('all')

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true)
      
      // Calculate date range
      const daysBack = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysBack)

      // Fetch inventory items
      let query = supabase
        .from('intake_items')
        .select('*')
        .not('removed_from_batch_at', 'is', null)
        .is('deleted_at', null)
        .gte('created_at', startDate.toISOString())

      const { data: items } = await query

      if (!items) return

      // Process inventory trends
      const inventoryTrends = processInventoryTrends(items, daysBack)
      
      // Process condition distribution
      const conditionDistribution = processConditionDistribution(items)
      
      // Process game distribution
      const gameDistribution = processGameDistribution(items)
      
      // Process price ranges
      const priceRanges = processPriceRanges(items)
      
      // Process set completion (mock data for now)
      const setCompletion = processSetCompletion(items)
      
      // Process monthly revenue (mock data for now)
      const monthlyRevenue = processMonthlyRevenue()

      setAnalyticsData({
        inventoryTrends,
        conditionDistribution,
        gameDistribution,
        priceRanges,
        setCompletion,
        monthlyRevenue
      })
    } catch (error) {
      console.error('Error fetching analytics:', error)
      toast.error('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalyticsData()
  }, [dateRange, selectedGame])

  const processInventoryTrends = (items: any[], days: number) => {
    const trends = []
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      
      const dayItems = items.filter(item => {
        const itemDate = new Date(item.created_at)
        return itemDate.toDateString() === date.toDateString()
      })
      
      const totalValue = dayItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      const totalItems = dayItems.reduce((sum, item) => sum + item.quantity, 0)
      const avgPrice = totalItems > 0 ? totalValue / totalItems : 0
      
      trends.unshift({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalValue: Math.round(totalValue),
        totalItems,
        avgPrice: Math.round(avgPrice * 100) / 100
      })
    }
    return trends
  }

  const processConditionDistribution = (items: any[]): ConditionData[] => {
    const conditions: Record<string, number> = {}
    
    items.forEach((item: any) => {
      const condition = item.variant || 'Near Mint'
      const quantity = isNumber(item.quantity) ? item.quantity : 0
      conditions[condition] = (conditions[condition] || 0) + quantity
    })

    const total = Object.values(conditions).reduce((sum: number, count: number) => sum + count, 0)
    
    return Object.entries(conditions).map(([condition, count]): ConditionData => ({
      condition,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: CONDITION_COLORS[condition as keyof typeof CONDITION_COLORS] || '#6b7280'
    }))
  }

  const processGameDistribution = (items: any[]): GameData[] => {
    const games: Record<string, { count: number, value: number }> = {}
    
    items.forEach((item: any) => {
      const game = item.catalog_snapshot?.game || 'other'
      const quantity = isNumber(item.quantity) ? item.quantity : 0
      const price = isNumber(item.price) ? item.price : 0
      
      if (!games[game]) {
        games[game] = { count: 0, value: 0 }
      }
      
      games[game].count += quantity
      games[game].value += price * quantity
    })

    return Object.entries(games).map(([game, data]): GameData => ({
      game: game.charAt(0).toUpperCase() + game.slice(1),
      count: data.count,
      value: Math.round(data.value),
      color: GAME_COLORS[game as keyof typeof GAME_COLORS] || '#6b7280'
    }))
  }

  const processPriceRanges = (items: any[]) => {
    const ranges = {
      '$0-$10': { count: 0, totalValue: 0 },
      '$10-$50': { count: 0, totalValue: 0 },
      '$50-$100': { count: 0, totalValue: 0 },
      '$100-$500': { count: 0, totalValue: 0 },
      '$500+': { count: 0, totalValue: 0 }
    }

    items.forEach(item => {
      const price = item.price || 0
      const value = price * item.quantity
      
      if (price <= 10) {
        ranges['$0-$10'].count += item.quantity
        ranges['$0-$10'].totalValue += value
      } else if (price <= 50) {
        ranges['$10-$50'].count += item.quantity
        ranges['$10-$50'].totalValue += value
      } else if (price <= 100) {
        ranges['$50-$100'].count += item.quantity
        ranges['$50-$100'].totalValue += value
      } else if (price <= 500) {
        ranges['$100-$500'].count += item.quantity
        ranges['$100-$500'].totalValue += value
      } else {
        ranges['$500+'].count += item.quantity
        ranges['$500+'].totalValue += value
      }
    })

    return Object.entries(ranges).map(([range, data]) => ({
      range,
      count: data.count,
      totalValue: Math.round(data.totalValue)
    }))
  }

  const processSetCompletion = (items: any[]) => {
    // Mock data for set completion - in real app, this would compare against complete set lists
    return [
      { setName: 'Base Set', totalCards: 102, ownedCards: 87, completionRate: 85, value: 12450 },
      { setName: 'Jungle', totalCards: 64, ownedCards: 45, completionRate: 70, value: 8200 },
      { setName: 'Fossil', totalCards: 62, ownedCards: 52, completionRate: 84, value: 9800 },
      { setName: 'Team Rocket', totalCards: 83, ownedCards: 23, completionRate: 28, value: 3400 },
      { setName: 'Gym Heroes', totalCards: 132, ownedCards: 67, completionRate: 51, value: 15600 }
    ]
  }

  const processMonthlyRevenue = () => {
    // Mock data for monthly revenue - in real app, this would come from sales data
    return [
      { month: 'Jan', revenue: 15400, profit: 6200, itemsSold: 124 },
      { month: 'Feb', revenue: 18200, profit: 7800, itemsSold: 156 },
      { month: 'Mar', revenue: 22100, profit: 9500, itemsSold: 189 },
      { month: 'Apr', revenue: 19800, profit: 8200, itemsSold: 167 },
      { month: 'May', revenue: 25600, profit: 11200, itemsSold: 203 },
      { month: 'Jun', revenue: 28900, profit: 13100, itemsSold: 234 }
    ]
  }

  const handleExport = (type: string) => {
    // In real app, this would generate and download actual files
    toast.success(`Exporting ${type} data...`)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="h-64 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedGame} onValueChange={setSelectedGame}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              <SelectItem value="pokemon">Pokémon</SelectItem>
              <SelectItem value="yugioh">Yu-Gi-Oh!</SelectItem>
              <SelectItem value="mtg">MTG</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => handleExport('all')} className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export All
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="sets">Set Completion</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Condition Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Condition Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analyticsData?.conditionDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ condition, percentage }) => `${condition} (${percentage}%)`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {analyticsData?.conditionDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Game Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Game Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.gameDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="game" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="Items" fill="#3b82f6" />
                    <Bar dataKey="value" name="Value ($)" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {/* Inventory Value Trends */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Inventory Value Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analyticsData?.inventoryTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Area 
                      type="monotone" 
                      dataKey="totalValue" 
                      stroke="#3b82f6" 
                      fill="#3b82f6" 
                      fillOpacity={0.2}
                      name="Total Value ($)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Price Range Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Price Range Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.priceRanges}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="Items" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sets" className="space-y-4">
          {/* Set Completion */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Set Completion Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analyticsData?.setCompletion.map((set) => (
                  <div key={set.setName} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{set.setName}</span>
                      <div className="text-right">
                        <div className="text-sm font-medium">{set.completionRate}%</div>
                        <div className="text-xs text-muted-foreground">
                          {set.ownedCards}/{set.totalCards} cards
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${set.completionRate}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Collection Value: ${set.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          {/* Monthly Revenue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Monthly Revenue & Profit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analyticsData?.monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="Revenue ($)"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="profit" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="Profit ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}