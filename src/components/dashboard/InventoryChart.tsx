import { useState } from "react"
import { 
  Area, 
  AreaChart, 
  Bar, 
  BarChart, 
  Line, 
  LineChart, 
  Pie, 
  PieChart, 
  Cell,
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis,
  CartesianGrid,
  Legend
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  ShoppingCart,
  Calendar,
  PieChart as PieChartIcon
} from "lucide-react"

// Mock data for different chart types
const inventoryTrendData = [
  { date: "Jan", totalValue: 45000, itemCount: 1250, avgPrice: 36 },
  { date: "Feb", totalValue: 52000, itemCount: 1380, avgPrice: 38 },
  { date: "Mar", totalValue: 48000, itemCount: 1420, avgPrice: 34 },
  { date: "Apr", totalValue: 61000, itemCount: 1580, avgPrice: 39 },
  { date: "May", totalValue: 58000, itemCount: 1620, avgPrice: 36 },
  { date: "Jun", totalValue: 67000, itemCount: 1750, avgPrice: 38 },
  { date: "Jul", totalValue: 72000, itemCount: 1820, avgPrice: 40 },
]

const conditionDistribution = [
  { condition: "Mint", value: 35, count: 560, color: "#10b981" },
  { condition: "Near Mint", value: 28, count: 448, color: "#3b82f6" },
  { condition: "Lightly Played", value: 20, count: 320, color: "#f59e0b" },
  { condition: "Moderately Played", value: 12, count: 192, color: "#ef4444" },
  { condition: "Heavily Played", value: 4, count: 64, color: "#6b7280" },
  { condition: "Damaged", value: 1, count: 16, color: "#374151" },
]

const gameDistribution = [
  { game: "Magic: The Gathering", value: 45, count: 810, revenue: 32400 },
  { game: "Pokemon EN", value: 25, count: 450, revenue: 18000 },
  { game: "Pokemon JP", value: 15, count: 270, revenue: 13500 },
  { game: "Yu-Gi-Oh!", value: 10, count: 180, revenue: 7200 },
  { game: "Dragon Ball Super", value: 5, count: 90, revenue: 3600 },
]

const recentSales = [
  { date: "Jul 1", sales: 2400, orders: 12 },
  { date: "Jul 2", sales: 1800, orders: 8 },
  { date: "Jul 3", sales: 3200, orders: 15 },
  { date: "Jul 4", sales: 2800, orders: 11 },
  { date: "Jul 5", sales: 4100, orders: 18 },
  { date: "Jul 6", sales: 3600, orders: 14 },
  { date: "Jul 7", sales: 2900, orders: 13 },
]

type ChartType = "inventory" | "sales" | "conditions" | "games"
type TimeRange = "7d" | "30d" | "90d" | "1y"

interface InventoryChartProps {
  className?: string
}

export function InventoryChart({ className }: InventoryChartProps) {
  const [chartType, setChartType] = useState<ChartType>("inventory")
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")

  const renderInventoryChart = () => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={inventoryTrendData}>
          <defs>
            <linearGradient id="totalValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="itemCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px"
            }}
            formatter={(value, name) => [
              name === "totalValue" ? `$${value.toLocaleString()}` : value,
              name === "totalValue" ? "Total Value" : "Item Count"
            ]}
          />
          <Area
            type="monotone"
            dataKey="totalValue"
            stroke="hsl(var(--primary))"
            fillOpacity={1}
            fill="url(#totalValue)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  const renderSalesChart = () => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={recentSales}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px"
            }}
            formatter={(value, name) => [
              name === "sales" ? `$${value.toLocaleString()}` : value,
              name === "sales" ? "Sales" : "Orders"
            ]}
          />
          <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const renderConditionsChart = () => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={conditionDistribution}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={2}
            dataKey="value"
          >
            {conditionDistribution.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px"
            }}
            formatter={(value) => [`${value}%`, "Percentage"]}
          />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const renderGamesChart = () => {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={gameDistribution} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis type="number" />
          <YAxis dataKey="game" type="category" width={100} />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px"
            }}
            formatter={(value, name) => [
              name === "revenue" ? `$${value.toLocaleString()}` : `${value}%`,
              name === "revenue" ? "Revenue" : "Percentage"
            ]}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const getChartIcon = () => {
    switch (chartType) {
      case "inventory": return Package
      case "sales": return DollarSign
      case "conditions": return PieChartIcon
      case "games": return ShoppingCart
      default: return TrendingUp
    }
  }

  const getChartTitle = () => {
    switch (chartType) {
      case "inventory": return "Inventory Value Over Time"
      case "sales": return "Recent Sales Performance"
      case "conditions": return "Card Condition Distribution"
      case "games": return "Game Distribution"
      default: return "Analytics"
    }
  }

  const renderChart = () => {
    switch (chartType) {
      case "inventory": return renderInventoryChart()
      case "sales": return renderSalesChart()
      case "conditions": return renderConditionsChart()
      case "games": return renderGamesChart()
      default: return renderInventoryChart()
    }
  }

  const ChartIcon = getChartIcon()

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ChartIcon className="h-5 w-5" />
            {getChartTitle()}
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Select value={chartType} onValueChange={(value: ChartType) => setChartType(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="conditions">Conditions</SelectItem>
                <SelectItem value="games">Games</SelectItem>
              </SelectContent>
            </Select>
            
            {(chartType === "inventory" || chartType === "sales") && (
              <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7d</SelectItem>
                  <SelectItem value="30d">30d</SelectItem>
                  <SelectItem value="90d">90d</SelectItem>
                  <SelectItem value="1y">1y</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {renderChart()}
        
        {/* Legend for pie charts */}
        {chartType === "conditions" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
            {conditionDistribution.map((item) => (
              <div key={item.condition} className="flex items-center gap-2 text-sm">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate">{item.condition}</span>
                <Badge variant="outline" className="text-xs">
                  {item.value}%
                </Badge>
              </div>
            ))}
          </div>
        )}
        
        {chartType === "games" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {gameDistribution.map((item) => (
              <div key={item.game} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">{item.game}</p>
                  <p className="text-sm text-muted-foreground">{item.count} cards</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">${item.revenue.toLocaleString()}</p>
                  <Badge variant="outline">{item.value}%</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}