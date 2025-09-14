import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Generic loading skeleton wrapper
export function LoadingSkeleton({ 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Skeleton 
      className={cn("animate-pulse bg-muted", className)} 
      {...props} 
    />
  )
}

// Table loading skeleton
export function TableLoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid grid-cols-6 gap-4 p-4 border rounded-lg">
        {Array.from({ length: 6 }).map((_, i) => (
          <LoadingSkeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-6 gap-4 p-4 border rounded-lg">
          {Array.from({ length: 6 }).map((_, colIndex) => (
            <LoadingSkeleton 
              key={colIndex} 
              className={cn(
                "h-4",
                colIndex === 0 && "w-3/4", // First column shorter
                colIndex === 1 && "w-full", // Second column full
                colIndex > 1 && "w-1/2"    // Others half
              )} 
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Card grid loading skeleton  
export function CardGridLoadingSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-0">
            {/* Image */}
            <LoadingSkeleton className="w-full aspect-[3/4] rounded-t-lg" />
            
            {/* Content */}
            <div className="p-4 space-y-3">
              <LoadingSkeleton className="h-4 w-3/4" />
              <LoadingSkeleton className="h-3 w-1/2" />
              <div className="flex justify-between">
                <LoadingSkeleton className="h-3 w-1/4" />
                <LoadingSkeleton className="h-3 w-1/3" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Stats cards loading skeleton
export function StatsLoadingSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <LoadingSkeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <LoadingSkeleton className="h-8 w-2/3 mb-2" />
            <LoadingSkeleton className="h-3 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Chart loading skeleton
export function ChartLoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <LoadingSkeleton className="h-6 w-1/3" />
        <LoadingSkeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent>
        <LoadingSkeleton className="h-64 w-full" />
      </CardContent>
    </Card>
  )
}

// Form loading skeleton
export function FormLoadingSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <LoadingSkeleton className="h-4 w-1/4" />
          <LoadingSkeleton className="h-10 w-full" />
        </div>
      ))}
      
      {/* Buttons */}
      <div className="flex gap-3">
        <LoadingSkeleton className="h-10 w-24" />
        <LoadingSkeleton className="h-10 w-20" />
      </div>
    </div>
  )
}

// Navigation loading skeleton
export function NavigationLoadingSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-4">
        <LoadingSkeleton className="h-8 w-32" />
        <div className="hidden md:flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <LoadingSkeleton key={i} className="h-8 w-20" />
          ))}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <LoadingSkeleton className="h-8 w-8 rounded-full" />
        <LoadingSkeleton className="h-8 w-24" />
      </div>
    </div>
  )
}

// List item loading skeleton
export function ListItemLoadingSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
          <LoadingSkeleton className="h-10 w-10 rounded" />
          <div className="flex-1 space-y-2">
            <LoadingSkeleton className="h-4 w-3/4" />
            <LoadingSkeleton className="h-3 w-1/2" />
          </div>
          <LoadingSkeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  )
}

// Page loading skeleton (full page)
export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <NavigationLoadingSkeleton />
      
      {/* Content */}
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <LoadingSkeleton className="h-8 w-1/3" />
          <LoadingSkeleton className="h-4 w-1/2" />
        </div>
        
        {/* Stats */}
        <StatsLoadingSkeleton />
        
        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TableLoadingSkeleton />
          </div>
          <div className="space-y-4">
            <ChartLoadingSkeleton />
            <ListItemLoadingSkeleton />
          </div>
        </div>
      </div>
    </div>
  )
}