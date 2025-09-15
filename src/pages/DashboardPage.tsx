import React from 'react';
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  DollarSign,
  Package,
  Printer,
  ShoppingCart,
  TrendingUp,
  Users,
  Zap,
  Download,
  Upload,
  RefreshCw,
  Plus
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

// Mock data - in real app, this would come from hooks/API calls
const mockStats = {
  labelsToday: 124,
  cardsAdded: 89,
  syncStatus: 'success',
  revenue: 1247.50,
};

const mockAlerts = [
  { id: 1, type: 'warning', message: 'Printer ink low', timestamp: '10 minutes ago' },
  { id: 2, type: 'error', message: 'Sync failed for 3 items', timestamp: '25 minutes ago' },
];

const mockActivity = [
  { id: 1, type: 'print', message: 'Printed 12 labels for Pokemon TCG', timestamp: '2 minutes ago' },
  { id: 2, type: 'sync', message: 'Synced 45 items to Shopify', timestamp: '15 minutes ago' },
  { id: 3, type: 'intake', message: 'Added batch LOT-000123', timestamp: '32 minutes ago' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'bulk-intake':
        navigate('/bulk-import');
        break;
      case 'print-queue':
        navigate('/labels');
        break;
      case 'force-sync':
        toast({ title: "Force sync initiated", description: "Shopify sync started in background" });
        break;
      case 'export-data':
        toast({ title: "Export started", description: "Your data export is being prepared" });
        break;
      default:
        break;
    }
  };

  const handleEndOfDayReport = async () => {
    try {
      // In real app, this would generate and download a CSV
      toast({ 
        title: "End of Day Report", 
        description: "Report generated and downloaded successfully" 
      });
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: "Unable to generate end of day report",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <Badge variant="outline">{new Date().toLocaleDateString()}</Badge>
            </div>
            <Navigation />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Today's Stats */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Labels Printed</CardTitle>
                  <Printer className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mockStats.labelsToday}</div>
                  <p className="text-xs text-muted-foreground">+12% from yesterday</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cards Added</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mockStats.cardsAdded}</div>
                  <p className="text-xs text-muted-foreground">+5% from yesterday</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Sync Status</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Online</div>
                  <p className="text-xs text-muted-foreground">Last sync 2 min ago</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${mockStats.revenue.toFixed(2)}</div>
                  <p className="text-xs text-muted-foreground">+8% from yesterday</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common tasks and operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col gap-2"
                    onClick={() => handleQuickAction('bulk-intake')}
                  >
                    <Plus className="h-5 w-5" />
                    Bulk Intake
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col gap-2"
                    onClick={() => handleQuickAction('print-queue')}
                  >
                    <Printer className="h-5 w-5" />
                    Print Queue
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col gap-2"
                    onClick={() => handleQuickAction('force-sync')}
                  >
                    <RefreshCw className="h-5 w-5" />
                    Force Sync
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-20 flex-col gap-2"
                    onClick={() => handleQuickAction('export-data')}
                  >
                    <Download className="h-5 w-5" />
                    Export Data
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Last 24 hours</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-4">
                    {mockActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="mt-1">
                          {activity.type === 'print' && <Printer className="h-4 w-4 text-blue-500" />}
                          {activity.type === 'sync' && <RefreshCw className="h-4 w-4 text-green-500" />}
                          {activity.type === 'intake' && <Package className="h-4 w-4 text-purple-500" />}
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm">{activity.message}</p>
                          <p className="text-xs text-muted-foreground">{activity.timestamp}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Active Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Active Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockAlerts.map((alert) => (
                    <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      {alert.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />}
                      {alert.type === 'error' && <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />}
                      <div className="flex-1">
                        <p className="text-sm">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">{alert.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* System Health */}
            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs text-muted-foreground">Online</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Shopify API</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs text-muted-foreground">Connected</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Print Service</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-xs text-muted-foreground">Warning</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* End of Day Report */}
            <Card>
              <CardHeader>
                <CardTitle>End of Day</CardTitle>
                <CardDescription>Generate daily summary report</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={handleEndOfDayReport}
                  className="w-full"
                  variant="outline"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Generate Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}