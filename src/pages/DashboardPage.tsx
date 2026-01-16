import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Award, FileEdit, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CurrentBatchPanel } from "@/components/CurrentBatchPanel";
import { SystemHealthCard } from "@/components/SystemHealthCard";
import { RefreshSectionButton } from "@/components/RefreshButton";
import { LiveModeToggle, useLiveMode } from "@/components/LiveModeToggle";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";

// Interface for stats
interface SystemStats {
  items_pushed: number;
}

export default function DashboardPage() {
  const navigate = useNavigate();
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


  return (
    <div className="container mx-auto px-4 py-6">
      <PageHeader
        title="Dashboard"
        description={new Date().toLocaleDateString()}
        showEcosystem
        actions={
          <div className="flex items-center gap-2">
            <LiveModeToggle
              onToggle={toggleLive}
              storageKey="dashboard-live-mode"
              label="Live"
              description=""
            />
            <RefreshSectionButton 
              queryKeyPrefix="dashboard" 
              label="Refresh" 
              size="sm"
            />
          </div>
        }
      />
        {/* System Stats */}
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

        {/* Quick Actions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Start adding items to inventory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50"
                onClick={() => navigate('/intake/graded')}
              >
                <Award className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <div className="font-semibold">Add Graded Cards</div>
                  <div className="text-xs text-muted-foreground">PSA, CGC certificates</div>
                </div>
                <ArrowRight className="h-4 w-4 absolute right-4" />
              </Button>

              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary/5 hover:border-primary/50"
                onClick={() => navigate('/intake/bulk')}
              >
                <FileEdit className="h-8 w-8 text-primary" />
                <div className="text-center">
                  <div className="font-semibold">Bulk Import</div>
                  <div className="text-xs text-muted-foreground">CSV, TCGPlayer data</div>
                </div>
                <ArrowRight className="h-4 w-4 absolute right-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

      {/* Current Batch */}
      <CurrentBatchPanel />
    </div>
  );
}