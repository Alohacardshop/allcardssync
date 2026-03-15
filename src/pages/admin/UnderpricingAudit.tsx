import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExternalLink, TrendingDown, AlertTriangle, RefreshCw, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface UnderpricingAlert {
  id: string;
  intake_item_id: string;
  sku: string | null;
  our_price: number;
  ebay_median: number;
  difference_percent: number;
  difference_dollars: number;
  match_count: number;
  search_query: string;
  alerted_at: string;
}

type SortField = 'difference_dollars' | 'difference_percent' | 'alerted_at' | 'our_price';

export default function UnderpricingAuditPage() {
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<SortField>('difference_dollars');
  const [isRunning, setIsRunning] = useState(false);

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['underpricing-alerts', sortBy],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('underpricing_alerts')
        .select('*')
        .order(sortBy, { ascending: sortBy === 'our_price' })
        .limit(100);

      if (error) throw error;
      return (data || []) as UnderpricingAlert[];
    },
  });

  const handleRunAudit = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('underpricing-audit', {
        body: {},
      });

      if (error) throw error;

      toast({
        title: 'Audit Complete',
        description: `Checked ${data.checked} items, flagged ${data.flagged}`,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: 'Audit Failed',
        description: err.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const totalOpportunity = alerts?.reduce((sum, a) => sum + a.difference_dollars, 0) || 0;
  const avgGapPercent = alerts?.length
    ? alerts.reduce((sum, a) => sum + a.difference_percent, 0) / alerts.length
    : 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Underpricing Audit"
        description="Daily title-based comp estimates from eBay sold listings. Review manually before repricing."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5" />
              Flagged Items
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{alerts?.length || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Total Gap
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-destructive">
                ${totalOpportunity.toFixed(2)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Gap %</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {avgGapPercent.toFixed(1)}%
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort by:</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="difference_dollars">$ Gap (highest)</SelectItem>
              <SelectItem value="difference_percent">% Gap (highest)</SelectItem>
              <SelectItem value="our_price">Our Price (lowest)</SelectItem>
              <SelectItem value="alerted_at">Most Recent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleRunAudit} disabled={isRunning}>
            <Play className="h-4 w-4 mr-1.5" />
            {isRunning ? 'Running…' : 'Run Audit Now'}
          </Button>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <strong>⚠️ Title-based comp estimate</strong> — Prices are derived from eBay sold listing
        searches using item titles. Results may include non-exact matches. Always verify comps
        manually before adjusting prices.
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !alerts?.length ? (
            <div className="p-12 text-center text-muted-foreground">
              <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No underpriced items flagged</p>
              <p className="text-sm mt-1">Run the audit or wait for the daily scan.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Our Price</TableHead>
                    <TableHead className="text-right">eBay Median</TableHead>
                    <TableHead className="text-right">Gap</TableHead>
                    <TableHead className="text-center">Comps</TableHead>
                    <TableHead>Flagged</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map((alert) => {
                    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(alert.search_query)}&LH_Sold=1&LH_Complete=1`;
                    return (
                      <TableRow key={alert.id}>
                        <TableCell>
                          <div className="max-w-[300px]">
                            <div className="font-medium text-sm truncate" title={alert.search_query}>
                              {alert.search_query}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              SKU: {alert.sku || '—'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${alert.our_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${alert.ebay_median.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <Badge variant="destructive" className="font-mono text-xs">
                              -${alert.difference_dollars.toFixed(2)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {alert.difference_percent.toFixed(1)}% under
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs">
                            {alert.match_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(alert.alerted_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <a
                            href={ebayUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View sold comps on eBay"
                          >
                            <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
