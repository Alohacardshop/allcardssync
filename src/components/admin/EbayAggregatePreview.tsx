import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Package, Loader2, RefreshCw, Search, AlertCircle, CheckCircle,
  ArrowRightLeft
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AggregateItem {
  id: string;
  store_key: string;
  sku: string;
  total_quantity: number;
  location_quantities: Record<string, number>;
  ebay_quantity: number | null;
  needs_sync: boolean;
  last_synced_to_ebay_at: string | null;
  updated_at: string;
}

interface EbayAggregatePreviewProps {
  storeKey: string;
  onRecalculateAll?: () => void;
}

export function EbayAggregatePreview({ storeKey, onRecalculateAll }: EbayAggregatePreviewProps) {
  const [aggregates, setAggregates] = useState<AggregateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAggregates();
  }, [storeKey]);

  const loadAggregates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ebay_inventory_aggregate')
        .select('*')
        .eq('store_key', storeKey)
        .order('updated_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      
      // Type cast the data properly
      const typedData = (data || []).map(item => ({
        ...item,
        location_quantities: (item.location_quantities || {}) as Record<string, number>
      }));
      
      setAggregates(typedData);
    } catch (error: any) {
      toast.error('Failed to load aggregates: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const recalculateAll = async () => {
    setRecalculating(true);
    try {
      // Get all unique SKUs from intake_items for this store
      const { data: skus, error: skuError } = await supabase
        .from('intake_items')
        .select('sku')
        .eq('store_key', storeKey)
        .not('sku', 'is', null)
        .gt('quantity', 0)
        .is('deleted_at', null);

      if (skuError) throw skuError;

      const uniqueSkus = [...new Set(skus?.map(s => s.sku).filter(Boolean))];
      
      let processed = 0;
      const batchSize = 50;
      
      for (let i = 0; i < uniqueSkus.length; i += batchSize) {
        const batch = uniqueSkus.slice(i, i + batchSize);
        await Promise.all(
          batch.map(sku => 
            supabase.rpc('recalculate_ebay_aggregate', { 
              p_sku: sku, 
              p_store_key: storeKey 
            })
          )
        );
        processed += batch.length;
      }

      toast.success(`Recalculated ${processed} SKUs`);
      await loadAggregates();
      onRecalculateAll?.();
    } catch (error: any) {
      toast.error('Failed to recalculate: ' + error.message);
    } finally {
      setRecalculating(false);
    }
  };

  const filteredAggregates = aggregates.filter(a => 
    !searchQuery || a.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const needsSyncCount = aggregates.filter(a => a.needs_sync).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Aggregate Inventory Preview
            </CardTitle>
            <CardDescription>
              Combined quantities across all Shopify locations for eBay listing
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {needsSyncCount > 0 && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                <AlertCircle className="h-3 w-3 mr-1" />
                {needsSyncCount} need sync
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={recalculateAll}
              disabled={recalculating}
            >
              {recalculating ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Recalculate All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{aggregates.length}</p>
            <p className="text-xs text-muted-foreground">Total SKUs</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">
              {aggregates.reduce((sum, a) => sum + a.total_quantity, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Total Units</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <p className="text-2xl font-bold">{needsSyncCount}</p>
            <p className="text-xs text-muted-foreground">Pending Sync</p>
          </div>
        </div>

        {/* Table */}
        {filteredAggregates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No aggregate data yet.</p>
            <p className="text-sm">Click "Recalculate All" to generate aggregates from inventory.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Local Qty</TableHead>
                  <TableHead className="text-center">
                    <ArrowRightLeft className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead className="text-right">eBay Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Locations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAggregates.map(agg => (
                  <TableRow key={agg.id}>
                    <TableCell className="font-mono text-sm">{agg.sku}</TableCell>
                    <TableCell className="text-right font-medium">
                      {agg.total_quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {agg.needs_sync ? (
                        <AlertCircle className="h-4 w-4 text-amber-500 mx-auto" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {agg.ebay_quantity ?? '—'}
                    </TableCell>
                    <TableCell>
                      {agg.needs_sync ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          Needs Sync
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          Synced
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(agg.location_quantities).map(([loc, qty]) => (
                          <Badge key={loc} variant="secondary" className="text-xs">
                            {qty}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
