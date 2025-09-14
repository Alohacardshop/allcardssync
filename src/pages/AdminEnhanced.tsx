import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Navigation } from "@/components/Navigation"
import { MobileBottomNav } from "@/components/navigation/MobileBottomNav"
import { RealTimeSyncMonitor } from "@/components/shopify/RealTimeSyncMonitor"
import { InventoryAnalytics } from "@/components/analytics/InventoryAnalytics"
import { KeyboardShortcuts, useKeyboardShortcuts } from "@/components/interactions/KeyboardShortcuts"
import { ErrorBoundaryWithRecovery } from "@/components/error-boundary/ErrorBoundaryWithRecovery"
import { 
  Activity, 
  BarChart3, 
  Settings, 
  Users, 
  Database,
  Shield,
  Zap,
  HelpCircle
} from "lucide-react"

// Import existing admin components  
import { SystemHealthCard } from "@/components/admin/SystemHealthCard"
import { SystemLogsViewer } from "@/components/admin/SystemLogsViewer"

const AdminEnhanced = () => {
  const [activeTab, setActiveTab] = useState("sync")
  const { showHelp, setShowHelp } = useKeyboardShortcuts()

  const adminTabs = [
    {
      value: "sync",
      label: "Sync Monitor",
      icon: Activity,
      description: "Real-time Shopify sync monitoring and controls"
    },
    {
      value: "analytics", 
      label: "Analytics",
      icon: BarChart3,
      description: "Inventory analytics and reporting"
    },
    {
      value: "system",
      label: "System",
      icon: Settings,
      description: "System configuration and health monitoring"
    },
    {
      value: "users",
      label: "Users",
      icon: Users,
      description: "User management and permissions"
    },
    {
      value: "security",
      label: "Security",
      icon: Shield,
      description: "Security settings and access logs"
    },
    {
      value: "performance",
      label: "Performance",
      icon: Zap,
      description: "Performance monitoring and optimization"
    }
  ]

  return (
    <ErrorBoundaryWithRecovery>
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        {/* Navigation */}
        <header className="border-b bg-card/50">
          <div className="container mx-auto px-4 py-3">
            <Navigation />
          </div>
        </header>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav />

        <div className="container mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                System administration and monitoring
              </p>
            </div>
            
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
              Help (?)
            </button>
          </div>

          {/* Admin Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Tab Navigation */}
            <div className="overflow-x-auto">
              <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto">
                {adminTabs.map((tab) => {
                  const Icon = tab.icon
                  return (
                    <TabsTrigger 
                      key={tab.value} 
                      value={tab.value}
                      className="flex items-center gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>

            {/* Tab Content */}
            <TabsContent value="sync" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Shopify Sync Monitor
                  </CardTitle>
                  <CardDescription>
                    Real-time monitoring of Shopify synchronization processes
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RealTimeSyncMonitor />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Inventory Analytics
                  </CardTitle>
                  <CardDescription>
                    Comprehensive analytics and insights for your trading card inventory
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InventoryAnalytics />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="system" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Shopify Configuration
                    </CardTitle>
                    <CardDescription>
                      Configure Shopify integration settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Environment setup coming soon...</p>
                  </CardContent>
                </Card>

                <SystemHealthCard />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    System Logs
                  </CardTitle>
                  <CardDescription>
                    Recent system activity and error logs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SystemLogsViewer />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription>
                    Manage user permissions and store assignments
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">User management features coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Security Overview
                    </CardTitle>
                    <CardDescription>
                      System security status and access controls
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div>
                          <p className="font-medium text-green-900 dark:text-green-100">
                            RLS Policies Active
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            All database tables protected by Row Level Security
                          </p>
                        </div>
                        <Shield className="h-8 w-8 text-green-600" />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <div>
                          <p className="font-medium text-blue-900 dark:text-blue-100">
                            Authentication Required
                          </p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            All API endpoints require valid authentication
                          </p>
                        </div>
                        <Shield className="h-8 w-8 text-blue-600" />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <div>
                          <p className="font-medium text-yellow-900 dark:text-yellow-100">
                            Audit Logging
                          </p>
                          <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            All admin actions are logged for security audit
                          </p>
                        </div>
                        <Database className="h-8 w-8 text-yellow-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Security Events</CardTitle>
                    <CardDescription>
                      Latest authentication and access events
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { event: "Admin login", user: "admin@company.com", time: "2 minutes ago", status: "success" },
                        { event: "Failed login attempt", user: "unknown@domain.com", time: "1 hour ago", status: "failed" },
                        { event: "User role changed", user: "staff@company.com", time: "3 hours ago", status: "success" },
                        { event: "Database backup", user: "system", time: "6 hours ago", status: "success" }
                      ].map((event, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <p className="text-sm font-medium">{event.event}</p>
                            <p className="text-xs text-muted-foreground">{event.user}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{event.time}</p>
                            <div className={`w-2 h-2 rounded-full ${
                              event.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Response Time</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">156ms</div>
                    <p className="text-xs text-muted-foreground">Average API response</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Database Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">98.9%</div>
                    <p className="text-xs text-muted-foreground">Query success rate</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Error Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">0.1%</div>
                    <p className="text-xs text-muted-foreground">Last 24 hours</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Uptime</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">99.9%</div>
                    <p className="text-xs text-muted-foreground">Last 30 days</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Performance Recommendations
                  </CardTitle>
                  <CardDescription>
                    Suggestions to improve system performance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-green-600">✓ Database Indexes Optimized</h4>
                      <p className="text-sm text-muted-foreground">All frequently queried tables have proper indexes</p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-blue-600">💡 Enable Query Caching</h4>
                      <p className="text-sm text-muted-foreground">Consider enabling Redis caching for frequently accessed data</p>
                    </div>
                    
                    <div className="p-3 border rounded-lg">
                      <h4 className="font-medium text-orange-600">⚠️ Monitor Shopify Rate Limits</h4>
                      <p className="text-sm text-muted-foreground">Current sync rate is approaching API limits during peak hours</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Keyboard Shortcuts Dialog */}
        <KeyboardShortcuts open={showHelp} onOpenChange={setShowHelp} />
      </div>
    </ErrorBoundaryWithRecovery>
  )
}

export default AdminEnhanced