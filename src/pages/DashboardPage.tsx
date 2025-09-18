import React, { useState, useEffect } from 'react';
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus,
  Award,
  FileEdit,
  Archive
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { GradedCardIntake } from "@/components/GradedCardIntake";
import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { CurrentBatchPanel } from "@/components/CurrentBatchPanel";

// Interface for stats
interface SystemStats {
  items_pushed: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("graded");
  const [systemStats, setSystemStats] = useState<SystemStats>({ items_pushed: 0 });
  const [loading, setLoading] = useState(true);

  // Fetch system stats
  const fetchStats = async () => {
    try {
      setLoading(true);
      
      let statsQuery = supabase
        .from('intake_items')
        .select('pushed_at')
        .is('deleted_at', null)
        .not('removed_from_batch_at', 'is', null);

      const { data: stats } = await statsQuery;

      const systemStats: SystemStats = {
        items_pushed: stats?.filter(item => item.pushed_at).length || 0
      };

      setSystemStats(systemStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast({ 
        title: "Error", 
        description: "Error loading dashboard stats",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Set up realtime subscription for stats updates
    const channel = supabase
      .channel('dashboard-stats-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intake_items'
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleBatchAdd = () => {
    // Refresh stats when items are added to batch
    fetchStats();
  };

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
        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 max-w-md mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Pushed</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{systemStats.items_pushed || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Synced to Shopify</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="graded" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-3 md:py-2">
              <Award className="h-4 w-4" />
              <span className="text-xs md:text-sm">Graded</span>
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-3 md:py-2">
              <FileEdit className="h-4 w-4" />
              <span className="text-xs md:text-sm">Raw</span>
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex flex-col md:flex-row items-center gap-1 md:gap-2 py-3 md:py-2">
              <Archive className="h-4 w-4" />
              <span className="text-xs md:text-sm">Batch</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="graded" className="mt-6 space-y-6">
            <GradedCardIntake onBatchAdd={handleBatchAdd} />
            <CurrentBatchPanel onViewFullBatch={() => setActiveTab("batch")} />
          </TabsContent>

          <TabsContent value="raw" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Raw Cards Intake</CardTitle>
                <CardDescription>Add raw (ungraded) cards to inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <TCGPlayerBulkImport onBatchAdd={handleBatchAdd} />
              </CardContent>
            </Card>
            <CurrentBatchPanel onViewFullBatch={() => setActiveTab("batch")} />
          </TabsContent>

          <TabsContent value="batch" className="mt-6">
            <CurrentBatchPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}