import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useInventoryAnalytics } from '@/hooks/useInventoryAnalytics';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  BarChart3,
  Calendar,
  Target,
  Package
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/contexts/StoreContext';

export function InventoryAnalytics() {
  const { data: analytics, isLoading, error } = useInventoryAnalytics();
  const [dateRange, setDateRange] = useState('30');
  const { selectedStore, selectedLocation } = useStore();

  if (isLoading) return <LoadingSpinner text="Loading analytics..." />;
  if (error) return <div className="text-destructive">Failed to load analytics</div>;
  if (!analytics) return null;

  const profitMargin = analytics.totalValue > 0 
    ? ((analytics.totalValue - analytics.totalCost) / analytics.totalValue * 100).toFixed(1)
    : '0';

  const averageItemValue = analytics.totalItems > 0 
    ? (analytics.totalValue / analytics.totalItems).toFixed(2)
    : '0';

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Inventory Analytics</h2>
          <p className="text-muted-foreground">
            {selectedStore && `Store: ${selectedStore}`} {selectedLocation && ` - Location: ${selectedLocation}`}
          </p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${analytics.totalValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Inventory value
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
              Potential: ${(analytics.totalValue - analytics.totalCost).toFixed(0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Item Value</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averageItemValue}</div>
            <p className="text-xs text-muted-foreground">
              Per item
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Items</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.recentItems}</div>
            <p className="text-xs text-muted-foreground">
              Added this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Status */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Inventory Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Total Items</span>
              <Badge variant="secondary">{analytics.totalItems}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Printed Items</span>
              <Badge variant="outline">{analytics.printedItems}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Pushed to Shopify</span>
              <Badge variant="default">{analytics.pushedItems}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Sync Rate</span>
              <Badge variant="secondary">
                {analytics.totalItems > 0 
                  ? Math.round((analytics.pushedItems / analytics.totalItems) * 100)
                  : 0
                }%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm">Print Completion</span>
              <Badge variant="outline">
                {analytics.totalItems > 0 
                  ? Math.round((analytics.printedItems / analytics.totalItems) * 100)
                  : 0
                }%
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Cost Ratio</span>
              <Badge variant="secondary">
                {analytics.totalValue > 0 
                  ? Math.round((analytics.totalCost / analytics.totalValue) * 100)
                  : 0
                }%
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">Avg Item Cost</span>
              <span className="text-sm font-medium">
                ${analytics.totalItems > 0 
                  ? (analytics.totalCost / analytics.totalItems).toFixed(2)
                  : '0.00'
                }
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category & Grade Analysis */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.categoryBreakdown)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .map(([category, count]) => (
                  <div key={category} className="flex justify-between items-center">
                    <span className="text-sm">{category || 'Unknown'}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-secondary rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full" 
                          style={{ 
                            width: `${(count as number / analytics.totalItems) * 100}%` 
                          }}
                        />
                      </div>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grade Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.gradeBreakdown)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .map(([grade, count]) => (
                  <div key={grade} className="flex justify-between items-center">
                    <span className="text-sm">{grade || 'Raw'}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-secondary rounded-full h-2">
                        <div 
                          className="bg-chart-1 h-2 rounded-full" 
                          style={{ 
                            width: `${(count as number / analytics.totalItems) * 100}%` 
                          }}
                        />
                      </div>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts & Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Insights & Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.printedItems < analytics.totalItems * 0.8 && (
              <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Low Print Rate</p>
                  <p className="text-xs text-yellow-700">
                    Only {Math.round((analytics.printedItems / analytics.totalItems) * 100)}% of items are printed
                  </p>
                </div>
              </div>
            )}
            
            {analytics.pushedItems < analytics.printedItems * 0.9 && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Clock className="h-4 w-4 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Sync Opportunity</p>
                  <p className="text-xs text-blue-700">
                    {analytics.printedItems - analytics.pushedItems} printed items ready for Shopify
                  </p>
                </div>
              </div>
            )}

            {Number(profitMargin) < 30 && (
              <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <TrendingUp className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Low Profit Margin</p>
                  <p className="text-xs text-red-700">
                    Consider reviewing pricing strategy for better margins
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}