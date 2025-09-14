import { format, formatDistanceToNow } from "date-fns"
import { 
  Package, 
  ShoppingCart, 
  Upload, 
  Download, 
  Edit, 
  Trash2, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface ActivityItem {
  id: string
  type: "inventory_add" | "inventory_update" | "inventory_delete" | "shopify_sync" | "batch_process" | "export" | "import"
  title: string
  description: string
  timestamp: Date
  user?: string
  status?: "success" | "error" | "warning" | "pending"
  metadata?: {
    cardName?: string
    cardImage?: string
    quantity?: number
    price?: number
    batchId?: string
  }
}

interface RecentActivityProps {
  activities?: ActivityItem[]
  maxItems?: number
}

const activityIcons = {
  inventory_add: Package,
  inventory_update: Edit,
  inventory_delete: Trash2,
  shopify_sync: RefreshCw,
  batch_process: Upload,
  export: Download,
  import: Upload
}

const statusColors = {
  success: "bg-success/10 text-success",
  error: "bg-destructive/10 text-destructive", 
  warning: "bg-warning/10 text-warning",
  pending: "bg-muted text-muted-foreground"
}

const statusIcons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertCircle,
  pending: Clock
}

// Mock data for demonstration
const mockActivities: ActivityItem[] = [
  {
    id: "1",
    type: "inventory_add",
    title: "Added cards to inventory",
    description: "25 Magic: The Gathering cards added to batch #1247",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    user: "John Smith",
    status: "success",
    metadata: {
      quantity: 25,
      batchId: "1247"
    }
  },
  {
    id: "2",
    type: "shopify_sync",
    title: "Shopify synchronization",
    description: "Successfully synced 150 products to Shopify store",
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    user: "System",
    status: "success",
    metadata: {
      quantity: 150
    }
  },
  {
    id: "3",
    type: "batch_process",
    title: "Batch processing failed",
    description: "Batch #1246 failed during Shopify sync - network timeout",
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    user: "System",
    status: "error",
    metadata: {
      batchId: "1246"
    }
  },
  {
    id: "4",
    type: "inventory_update",
    title: "Price updated",
    description: "Black Lotus (Alpha) price changed from $45,000 to $47,500",
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
    user: "Jane Doe",
    status: "success",
    metadata: {
      cardName: "Black Lotus (Alpha)",
      price: 47500
    }
  },
  {
    id: "5",
    type: "export",
    title: "Inventory exported",
    description: "Full inventory exported to CSV (2,450 items)",
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
    user: "Admin",
    status: "success",
    metadata: {
      quantity: 2450
    }
  }
]

export function RecentActivity({ activities = mockActivities, maxItems = 10 }: RecentActivityProps) {
  const displayActivities = activities.slice(0, maxItems)

  const getActivityIcon = (type: ActivityItem["type"], status?: ActivityItem["status"]) => {
    const IconComponent = activityIcons[type]
    return IconComponent
  }

  const getStatusIcon = (status?: ActivityItem["status"]) => {
    if (!status) return null
    const IconComponent = statusIcons[status]
    return IconComponent
  }

  const getUserInitials = (name?: string) => {
    if (!name) return "SY"
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-96">
          <div className="space-y-1">
            {displayActivities.map((activity, index) => {
              const ActivityIcon = getActivityIcon(activity.type, activity.status)
              const StatusIcon = getStatusIcon(activity.status)
              
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors border-b last:border-b-0"
                >
                  {/* Activity Icon */}
                  <div className="flex-shrink-0 mt-1">
                    <div className="p-2 rounded-lg bg-muted">
                      <ActivityIcon className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {activity.title}
                      </p>
                      {activity.status && (
                        <Badge variant="outline" className={statusColors[activity.status]}>
                          {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                          {activity.status}
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {activity.description}
                    </p>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span title={format(activity.timestamp, "PPpp")}>
                        {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                      </span>
                      {activity.user && (
                        <div className="flex items-center gap-1">
                          <Avatar className="h-4 w-4">
                            <AvatarFallback className="text-xs">
                              {getUserInitials(activity.user)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{activity.user}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            {displayActivities.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recent activity to display</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}