import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInventoryAnalytics } from "@/hooks/useInventoryAnalytics";
import { useStore } from "@/contexts/StoreContext";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Package, DollarSign, PrinterIcon, TrendingUp } from "lucide-react";

export function SystemStats() {
  const { selectedStore, selectedLocation } = useStore();
  const { data: analytics, isLoading, error } = useInventoryAnalytics(
    selectedStore, 
    selectedLocation
  );

  if (isLoading) return <LoadingSpinner text="Loading analytics..." />;
  if (error) return <div className="text-destructive">Failed to load analytics</div>;
  if (!analytics) return null;

  const profitMargin = analytics.totalValue > 0 
    ? ((analytics.totalValue - analytics.totalCost) / analytics.totalValue * 100).toFixed(1)
    : '0';

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Items</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.totalItems}</div>
          <p className="text-xs text-muted-foreground">
            {analytics.recentItems} added this month
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${analytics.totalValue.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">
            Cost: ${analytics.totalCost.toFixed(0)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Print Status</CardTitle>
          <PrinterIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.printedItems}</div>
          <p className="text-xs text-muted-foreground">
            {analytics.pushedItems} pushed to Shopify
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{profitMargin}%</div>
          <p className="text-xs text-muted-foreground">
            Potential profit: ${(analytics.totalValue - analytics.totalCost).toFixed(0)}
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-1 sm:col-span-2 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.categoryBreakdown).map(([category, count]) => (
              <Badge key={category} variant="secondary">
                {category}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-1 sm:col-span-2 lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Grade Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Object.entries(analytics.gradeBreakdown).map(([grade, count]) => (
              <Badge key={grade} variant="outline">
                {grade}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}