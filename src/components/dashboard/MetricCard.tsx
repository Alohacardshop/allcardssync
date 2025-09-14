import { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    period: string
  }
  icon: LucideIcon
  className?: string
  gradient?: "primary" | "secondary" | "success" | "warning" | "info"
  trend?: "up" | "down" | "neutral"
}

const gradientClasses = {
  primary: "bg-gradient-primary",
  secondary: "bg-gradient-secondary", 
  success: "bg-gradient-success",
  warning: "bg-gradient-warning",
  info: "bg-gradient-info"
}

const iconBackgroundClasses = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info"
}

export function MetricCard({
  title,
  value,
  change,
  icon: Icon,
  className,
  gradient = "primary",
  trend = "neutral"
}: MetricCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === "number") {
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`
      } else if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`
      } else {
        return val.toLocaleString()
      }
    }
    return val
  }

  const getTrendColor = () => {
    switch (trend) {
      case "up":
        return "text-success"
      case "down":
        return "text-destructive"
      default:
        return "text-muted-foreground"
    }
  }

  const getTrendIcon = () => {
    switch (trend) {
      case "up":
        return "↗"
      case "down":
        return "↘"
      default:
        return "→"
    }
  }

  return (
    <Card className={cn(
      "hover:shadow-elegant transition-all duration-300 group cursor-pointer border-0 relative overflow-hidden",
      className
    )}>
      {/* Background gradient overlay */}
      <div className={cn(
        "absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity",
        gradientClasses[gradient]
      )} />
      
      <CardContent className="p-6 relative">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <div className="space-y-1">
              <p className="text-3xl font-bold tracking-tight">
                {formatValue(value)}
              </p>
              {change && (
                <p className={cn("text-sm flex items-center gap-1", getTrendColor())}>
                  <span className="text-lg">{getTrendIcon()}</span>
                  {change.value > 0 ? "+" : ""}{change.value}% {change.period}
                </p>
              )}
            </div>
          </div>
          
          <div className={cn(
            "p-4 rounded-lg transition-colors group-hover:scale-110 duration-300",
            iconBackgroundClasses[gradient]
          )}>
            <Icon className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}