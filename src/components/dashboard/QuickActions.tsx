import { 
  Plus, 
  Upload, 
  Download, 
  BarChart3, 
  RefreshCw, 
  Settings, 
  Search,
  Package,
  ShoppingCart,
  FileText,
  Zap
} from "lucide-react"
import { Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface QuickAction {
  id: string
  title: string
  description: string
  icon: typeof Plus
  href?: string
  onClick?: () => void
  variant?: "default" | "secondary" | "success" | "warning"
  badge?: string
  disabled?: boolean
  loading?: boolean
}

interface QuickActionsProps {
  onAddCards?: () => void
  onBulkImport?: () => void
  onExportData?: () => void
  onViewReports?: () => void
  onStartSync?: () => void
  onManageSettings?: () => void
  syncStatus?: "idle" | "syncing" | "error"
  pendingSyncCount?: number
}

const variantClasses = {
  default: "border-primary/20 hover:border-primary/40 hover:bg-primary/5",
  secondary: "border-secondary/20 hover:border-secondary/40 hover:bg-secondary/5",
  success: "border-success/20 hover:border-success/40 hover:bg-success/5",
  warning: "border-warning/20 hover:border-warning/40 hover:bg-warning/5"
}

const iconClasses = {
  default: "text-primary bg-primary/10",
  secondary: "text-secondary-foreground bg-secondary/10",
  success: "text-success bg-success/10", 
  warning: "text-warning bg-warning/10"
}

export function QuickActions({
  onAddCards,
  onBulkImport,
  onExportData,
  onViewReports,
  onStartSync,
  onManageSettings,
  syncStatus = "idle",
  pendingSyncCount = 0
}: QuickActionsProps) {
  
  const quickActions: QuickAction[] = [
    {
      id: "add-cards",
      title: "Add Cards",
      description: "Manually add cards to inventory",
      icon: Plus,
      onClick: onAddCards,
      variant: "success"
    },
    {
      id: "bulk-import",
      title: "Bulk Import",
      description: "Import cards from CSV or scan barcodes",
      icon: Upload,
      onClick: onBulkImport,
      variant: "default"
    },
    {
      id: "sync-shopify",
      title: syncStatus === "syncing" ? "Syncing..." : "Sync to Shopify",
      description: syncStatus === "syncing" 
        ? "Synchronization in progress"
        : `${pendingSyncCount} items pending sync`,
      icon: RefreshCw,
      onClick: onStartSync,
      variant: syncStatus === "error" ? "warning" : "default",
      badge: pendingSyncCount > 0 ? pendingSyncCount.toString() : undefined,
      loading: syncStatus === "syncing",
      disabled: syncStatus === "syncing"
    },
    {
      id: "export-data",
      title: "Export Data",
      description: "Download inventory reports",
      icon: Download,
      onClick: onExportData,
      variant: "secondary"
    },
    {
      id: "view-reports",
      title: "Analytics",
      description: "View sales and inventory analytics",
      icon: BarChart3,
      onClick: onViewReports,
      variant: "default"
    },
    {
      id: "settings",
      title: "Settings",
      description: "Configure system settings",
      icon: Settings,
      onClick: onManageSettings,
      variant: "secondary"
    }
  ]

  // Additional context-aware actions
  const contextActions: QuickAction[] = [
    {
      id: "search-cards",
      title: "Search Inventory",
      description: "Find specific cards or sets",
      icon: Search,
      href: "/inventory",
      variant: "secondary"
    },
    {
      id: "manage-batches",
      title: "Manage Batches", 
      description: "View and process card batches",
      icon: Package,
      href: "/batches",
      variant: "default"
    }
  ]

  const handleAction = (action: QuickAction) => {
    if (action.disabled) return
    
    if (action.onClick) {
      action.onClick()
    }
  }

  const ActionButton = ({ action }: { action: QuickAction }) => {
    const IconComponent = action.icon
    const variant = action.variant || "default"

    const content = (
      <Card className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-elegant group h-full",
        variantClasses[variant],
        action.disabled && "opacity-50 cursor-not-allowed"
      )}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={cn(
              "p-3 rounded-lg transition-transform group-hover:scale-110",
              iconClasses[variant]
            )}>
              <IconComponent className={cn(
                "h-6 w-6",
                action.loading && "animate-spin"
              )} />
            </div>
            {action.badge && (
              <Badge variant="secondary" className="text-xs">
                {action.badge}
              </Badge>
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
              {action.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {action.description}
            </p>
          </div>
        </CardContent>
      </Card>
    )

    if (action.href) {
      return (
        <Link to={action.href} className="block">
          {content}
        </Link>
      )
    }

    return (
      <div onClick={() => handleAction(action)}>
        {content}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickActions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Context Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Inventory Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contextActions.map((action) => (
              <ActionButton key={action.id} action={action} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}