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
import { SystemHealthCard } from "@/components/SystemHealthCard";
import { RefreshSectionButton } from "@/components/RefreshButton";
import { LiveModeToggle, useLiveMode } from "@/components/LiveModeToggle";
import { useQuery } from "@tanstack/react-query";

// Interface for stats
interface SystemStats {
  items_pushed: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("graded");
  const { isLive, toggleLive } = useLiveMode(['dashboard'], 'dashboard-live-mode');

  // Use React Query for stats instead of manual state + useEffect
  const { data: systemStats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: fetchStats,
    staleTime: 60_000, // Fresh for 1 minute
    refetchInterval: isLive ? 120_000 : false, // Only poll in live mode
    refetchOnWindowFocus: true,
  });

  // Fetch system stats function
  async function fetchStats() {
    let statsQuery = supabase
      .from('intake_items')
      .select('pushed_at')
      .is('deleted_at', null)
      .not('removed_from_batch_at', 'is', null);

    const { data: stats } = await statsQuery;

    return {
      items_pushed: stats?.filter(item => item.pushed_at).length || 0
    };
  }

  const handleBatchAdd = () => {
    // Refresh stats when items are added to batch - invalidate the query
    // queryClient.invalidateQueries(['dashboard', 'stats']); // Can be called if needed
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
              <LiveModeToggle
                onToggle={toggleLive}
                storageKey="dashboard-live-mode"
                label="Live"
                description=""
              />
            </div>
            <div className="flex items-center gap-2">
              <RefreshSectionButton 
                queryKeyPrefix="dashboard" 
                label="Refresh" 
                size="sm"
              />
              <Navigation />
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* System Stats and Health */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Items Pushed</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : (systemStats?.items_pushed || 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Synced to Shopify</p>
            </CardContent>
          </Card>
          
          <div className="lg:col-span-2">
            <SystemHealthCard />
          </div>
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

          <TabsContent value="graded" className="mt-6">
            <GradedCardIntake onBatchAdd={handleBatchAdd} />
          </TabsContent>

          <TabsContent value="raw" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Raw Cards Intake</CardTitle>
                <CardDescription>Add raw (ungraded) cards to inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <TCGPlayerBulkImport onBatchAdd={handleBatchAdd} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batch" className="mt-6">
            <CurrentBatchPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}