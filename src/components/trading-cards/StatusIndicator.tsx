import { memo } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Package, 
  Zap,
  RefreshCw,
  Pause,
  Play,
  AlertCircle
} from "lucide-react"

export type StatusType = 
  | 'success' | 'warning' | 'error' | 'info' | 'pending' 
  | 'processing' | 'completed' | 'failed' | 'paused'
  | 'in-stock' | 'low-stock' | 'out-of-stock'
  | 'queued' | 'syncing' | 'active' | 'inactive'

interface StatusIndicatorProps {
  status: StatusType
  label?: string
  size?: 'sm' | 'default' | 'lg'
  showIcon?: boolean
  variant?: 'badge' | 'dot' | 'minimal'
  className?: string
}

const statusConfig: Record<StatusType, {
  color: string
  icon: React.ComponentType<{ className?: string }>
  defaultLabel: string
}> = {
  // Basic status types
  success: { color: 'status-success', icon: CheckCircle, defaultLabel: 'Success' },
  warning: { color: 'status-warning', icon: AlertTriangle, defaultLabel: 'Warning' },
  error: { color: 'status-error', icon: XCircle, defaultLabel: 'Error' },
  info: { color: 'status-info', icon: AlertCircle, defaultLabel: 'Info' },
  pending: { color: 'text-muted-foreground', icon: Clock, defaultLabel: 'Pending' },
  
  // Process status types
  processing: { color: 'status-info', icon: RefreshCw, defaultLabel: 'Processing' },
  completed: { color: 'status-success', icon: CheckCircle, defaultLabel: 'Completed' },
  failed: { color: 'status-error', icon: XCircle, defaultLabel: 'Failed' },
  paused: { color: 'status-warning', icon: Pause, defaultLabel: 'Paused' },
  
  // Inventory status types
  'in-stock': { color: 'status-success', icon: Package, defaultLabel: 'In Stock' },
  'low-stock': { color: 'status-warning', icon: AlertTriangle, defaultLabel: 'Low Stock' },
  'out-of-stock': { color: 'status-error', icon: XCircle, defaultLabel: 'Out of Stock' },
  
  // Queue/sync status types
  queued: { color: 'text-muted-foreground', icon: Clock, defaultLabel: 'Queued' },
  syncing: { color: 'status-info', icon: RefreshCw, defaultLabel: 'Syncing' },
  active: { color: 'status-success', icon: Play, defaultLabel: 'Active' },
  inactive: { color: 'text-muted-foreground', icon: Pause, defaultLabel: 'Inactive' },
}

export const StatusIndicator = memo<StatusIndicatorProps>(({
  status,
  label,
  size = 'default',
  showIcon = true,
  variant = 'badge',
  className
}) => {
  const config = statusConfig[status] || statusConfig.info
  const Icon = config.icon
  const displayLabel = label || config.defaultLabel

  const iconSizes = {
    sm: 'h-3 w-3',
    default: 'h-4 w-4',
    lg: 'h-5 w-5'
  }

  const badgeSizes = {
    sm: 'text-2xs px-2 py-0.5',
    default: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3 py-1'
  }

  if (variant === 'dot') {
    return (
      <div className={cn("flex items-center space-x-2", className)}>
        <div className={cn(
          "rounded-full",
          size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-4 h-4' : 'w-3 h-3',
          config.color === 'status-success' && 'bg-success',
          config.color === 'status-warning' && 'bg-warning',
          config.color === 'status-error' && 'bg-destructive',
          config.color === 'status-info' && 'bg-info',
          config.color === 'text-muted-foreground' && 'bg-muted-foreground'
        )} />
        <span className={cn(
          "font-medium",
          config.color,
          size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
        )}>
          {displayLabel}
        </span>
      </div>
    )
  }

  if (variant === 'minimal') {
    return (
      <div className={cn("flex items-center space-x-1.5", className)}>
        {showIcon && (
          <Icon className={cn(iconSizes[size], config.color)} />
        )}
        <span className={cn(
          "font-medium",
          config.color,
          size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'
        )}>
          {displayLabel}
        </span>
      </div>
    )
  }

  // Default badge variant
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center space-x-1.5 font-medium border",
        config.color,
        badgeSizes[size],
        className
      )}
    >
      {showIcon && (
        <Icon className={cn(
          iconSizes[size],
          status === 'processing' || status === 'syncing' ? 'animate-spin' : ''
        )} />
      )}
      <span>{displayLabel}</span>
    </Badge>
  )
})

StatusIndicator.displayName = "StatusIndicator"

// Utility component for inventory status specifically
export const InventoryStatus = memo<{
  quantity: number
  lowStockThreshold?: number
  size?: 'sm' | 'default' | 'lg'
  className?: string
}>(({ quantity, lowStockThreshold = 3, size = 'default', className }) => {
  let status: StatusType
  let label: string

  if (quantity === 0) {
    status = 'out-of-stock'
    label = 'Out of Stock'
  } else if (quantity <= lowStockThreshold) {
    status = 'low-stock'
    label = `Low Stock (${quantity})`
  } else {
    status = 'in-stock'
    label = `In Stock (${quantity})`
  }

  return (
    <StatusIndicator
      status={status}
      label={label}
      size={size}
      className={className}
    />
  )
})

InventoryStatus.displayName = "InventoryStatus"

// Utility component for sync queue status
export const SyncStatus = memo<{
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'paused'
  errorMessage?: string
  size?: 'sm' | 'default' | 'lg'
  className?: string
}>(({ status, errorMessage, size = 'default', className }) => {
  const label = errorMessage && status === 'failed' 
    ? `Failed: ${errorMessage.substring(0, 30)}${errorMessage.length > 30 ? '...' : ''}`
    : undefined

  return (
    <StatusIndicator
      status={status}
      label={label}
      size={size}
      className={className}
    />
  )
})

SyncStatus.displayName = "SyncStatus"