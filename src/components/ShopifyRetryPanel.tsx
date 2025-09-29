/**
 * Panel for retrying failed Shopify syncs with safe idempotent operations
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useShopifyUpsert } from '@/hooks/useShopifyUpsert';
import { buildHandle, buildSku } from '@/lib/shopify/ids';
import { UpsertCard } from '@/lib/shopify/upsert';

interface FailedItem {
  id: string;
  lot_number: string;
  brand_title?: string;
  subject?: string;
  year?: string;
  category?: string;
  grade?: string;
  price?: number;
  last_shopify_sync_error?: string;
  last_shopify_synced_at?: string;
}

export function ShopifyRetryPanel() {
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  const {
    processing,
    processed,
    total,
    errors,
    successes,
    upsertBatch,
    retryFailed,
    resetState
  } = useShopifyUpsert();

  const loadFailedItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select(`
          id,
          lot_number,
          brand_title,
          subject,
          year,
          category,
          grade,
          price,
          last_shopify_sync_error,
          last_shopify_synced_at
        `)
        .in('shopify_sync_status', ['failed', 'error'])
        .is('deleted_at', null)
        .order('last_shopify_synced_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      
      setFailedItems(data || []);
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Failed to load failed items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFailedItems();
  }, []);

  const toggleItemSelection = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const selectAll = () => {
    setSelectedItems(new Set(failedItems.map(item => item.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleRetrySelected = async () => {
    if (selectedItems.size === 0) return;

    const itemsToRetry = failedItems
      .filter(item => selectedItems.has(item.id))
      .map(item => ({
        id: item.id,
        card: convertToUpsertCard(item)
      }));

    resetState();
    await retryFailed(itemsToRetry);
    
    // Reload failed items to reflect changes
    setTimeout(() => {
      loadFailedItems();
    }, 1000);
  };

  const convertToUpsertCard = (item: FailedItem): UpsertCard => {
    return {
      externalId: item.id, // Use intake item ID as external ID
      intakeId: item.id,
      title: `${item.brand_title || 'Unknown'} ${item.subject || 'Card'}`,
      descriptionHtml: `${item.year || ''} ${item.brand_title || ''} ${item.subject || ''} ${item.category || ''}`.trim(),
      game: item.brand_title || 'Unknown',
      setCode: item.year || 'UNKNOWN',
      number: item.lot_number,
      finish: 'regular',
      grade: item.grade,
      price: item.price,
      inventory: 1
    };
  };

  const getErrorBadgeVariant = (error: string | null) => {
    if (!error) return 'secondary';
    if (error.includes('rate')) return 'destructive';
    if (error.includes('timeout')) return 'secondary';
    if (error.includes('userErrors')) return 'destructive';
    return 'destructive';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading failed items...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            Failed Shopify Syncs
          </CardTitle>
          <CardDescription>
            Items that failed to sync to Shopify. Select items to retry with safe, idempotent operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {failedItems.length === 0 ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  No failed items found. All items have been successfully synced to Shopify.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                      disabled={processing}
                    >
                      Select All ({failedItems.length})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearSelection}
                      disabled={processing || selectedItems.size === 0}
                    >
                      Clear Selection
                    </Button>
                    <Badge variant="secondary">
                      {selectedItems.size} selected
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadFailedItems}
                      disabled={processing}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Refresh
                    </Button>
                    <Button
                      onClick={handleRetrySelected}
                      disabled={processing || selectedItems.size === 0}
                      className="gap-2"
                    >
                      {processing ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Retry Selected ({selectedItems.size})
                    </Button>
                  </div>
                </div>

                {processing && (
                  <div className="space-y-2">
                    <Progress 
                      value={(processed / total) * 100} 
                      className="w-full" 
                    />
                    <p className="text-sm text-muted-foreground text-center">
                      Processing {processed} of {total} items...
                    </p>
                  </div>
                )}

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {failedItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedItems.has(item.id) 
                          ? 'bg-accent border-primary' 
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => toggleItemSelection(item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {item.lot_number}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.brand_title} {item.subject}
                          </Badge>
                          {item.grade && (
                            <Badge variant="secondary" className="text-xs">
                              Grade {item.grade}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant={getErrorBadgeVariant(item.last_shopify_sync_error)}
                            className="text-xs"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                          {item.last_shopify_synced_at && (
                            <span className="text-xs text-muted-foreground">
                              Last attempt: {new Date(item.last_shopify_synced_at).toLocaleString()}
                            </span>
                          )}
                        </div>
                        
                        {item.last_shopify_sync_error && (
                          <p className="text-xs text-destructive mt-1 truncate">
                            {item.last_shopify_sync_error}
                          </p>
                        )}
                      </div>
                      
                      {item.price && (
                        <div className="text-right">
                          <span className="text-sm font-medium">
                            ${item.price.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}