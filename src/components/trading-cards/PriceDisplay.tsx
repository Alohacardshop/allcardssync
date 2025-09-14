import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus, DollarSign } from "lucide-react"

interface PriceDisplayProps {
  price: number
  cost?: number
  previousPrice?: number
  currency?: string
  size?: 'sm' | 'default' | 'lg'
  showTrend?: boolean
  showProfit?: boolean
  showCurrency?: boolean
  variant?: 'default' | 'compact' | 'detailed'
  className?: string
}

export const PriceDisplay = memo<PriceDisplayProps>(({
  price,
  cost,
  previousPrice,
  currency = 'USD',
  size = 'default',
  showTrend = false,
  showProfit = false,
  showCurrency = true,
  variant = 'default',
  className
}) => {
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatPriceSimple = (amount: number) => {
    return amount.toFixed(2)
  }

  const getProfitData = () => {
    if (!cost) return null
    const profit = price - cost
    const profitMargin = (profit / price) * 100
    return {
      profit,
      profitMargin,
      isPositive: profit > 0
    }
  }

  const getTrendData = () => {
    if (!previousPrice) return null
    const change = price - previousPrice
    const changePercent = (change / previousPrice) * 100
    return {
      change,
      changePercent,
      isPositive: change > 0,
      isNeutral: Math.abs(change) < 0.01
    }
  }

  const textSizes = {
    sm: 'text-sm',
    default: 'text-base',
    lg: 'text-lg'
  }

  const profitData = showProfit ? getProfitData() : null
  const trendData = showTrend ? getTrendData() : null

  if (variant === 'compact') {
    return (
      <div className={cn("flex items-center space-x-1", className)}>
        {showCurrency && <DollarSign className="h-3 w-3 text-muted-foreground" />}
        <span className={cn("font-semibold", textSizes[size])}>
          {showCurrency ? formatPrice(price) : formatPriceSimple(price)}
        </span>
        {trendData && !trendData.isNeutral && (
          <div className={cn(
            "flex items-center space-x-0.5",
            trendData.isPositive ? "text-success" : "text-destructive"
          )}>
            {trendData.isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            <span className="text-2xs font-medium">
              {Math.abs(trendData.changePercent).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    )
  }

  if (variant === 'detailed') {
    return (
      <div className={cn("space-y-2", className)}>
        {/* Main Price */}
        <div className="flex items-center space-x-2">
          <span className={cn("font-bold", 
            size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl'
          )}>
            {showCurrency ? formatPrice(price) : `${formatPriceSimple(price)}`}
          </span>
          {trendData && !trendData.isNeutral && (
            <Badge variant="outline" className={cn(
              "text-2xs",
              trendData.isPositive ? "border-success text-success" : "border-destructive text-destructive"
            )}>
              <div className="flex items-center space-x-1">
                {trendData.isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                <span>{trendData.isPositive ? '+' : ''}{trendData.changePercent.toFixed(1)}%</span>
              </div>
            </Badge>
          )}
        </div>

        {/* Additional Info */}
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          {cost && (
            <div className="flex items-center space-x-1">
              <span>Cost:</span>
              <span className="font-medium">
                {showCurrency ? formatPrice(cost) : formatPriceSimple(cost)}
              </span>
            </div>
          )}
          
          {profitData && (
            <div className="flex items-center space-x-1">
              <span>Profit:</span>
              <span className={cn(
                "font-medium",
                profitData.isPositive ? "text-success" : "text-destructive"
              )}>
                {profitData.isPositive ? '+' : ''}
                {showCurrency ? formatPrice(profitData.profit) : formatPriceSimple(profitData.profit)}
                {' '}({profitData.profitMargin.toFixed(1)}%)
              </span>
            </div>
          )}
          
          {previousPrice && (
            <div className="flex items-center space-x-1">
              <span>Previous:</span>
              <span className="font-medium">
                {showCurrency ? formatPrice(previousPrice) : formatPriceSimple(previousPrice)}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <span className={cn("font-semibold", textSizes[size])}>
        {showCurrency ? formatPrice(price) : formatPriceSimple(price)}
      </span>
      
      {trendData && !trendData.isNeutral && (
        <div className={cn(
          "flex items-center space-x-1",
          trendData.isPositive ? "text-success" : "text-destructive"
        )}>
          {trendData.isPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">
            {trendData.isPositive ? '+' : ''}{trendData.changePercent.toFixed(1)}%
          </span>
        </div>
      )}
      
      {profitData && (
        <Badge variant="outline" className={cn(
          "text-2xs",
          profitData.isPositive ? "border-success text-success" : "border-destructive text-destructive"
        )}>
          {profitData.isPositive ? '+' : ''}
          {showCurrency ? formatPrice(profitData.profit) : formatPriceSimple(profitData.profit)}
        </Badge>
      )}
    </div>
  )
})

PriceDisplay.displayName = "PriceDisplay"

// Utility component for simple price with optional comparison
export const SimplePrice = memo<{
  price: number
  comparePrice?: number
  currency?: string
  size?: 'sm' | 'default' | 'lg'
  className?: string
}>(({ price, comparePrice, currency = 'USD', size = 'default', className }) => {
  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const textSizes = {
    sm: 'text-sm',
    default: 'text-base',
    lg: 'text-lg'
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <span className={cn("font-semibold", textSizes[size])}>
        {formatPrice(price)}
      </span>
      {comparePrice && comparePrice !== price && (
        <span className="text-sm text-muted-foreground line-through">
          {formatPrice(comparePrice)}
        </span>
      )}
    </div>
  )
})

SimplePrice.displayName = "SimplePrice"