import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logger } from '@/lib/logger';

interface DuplicateGroup {
  psa_cert: string;
  count: number;
  item_ids: string[];
  shopify_product_ids: string[];
  created_times: string[];
  skus: string[];
}

export const DuplicateCleanup = () => {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    try {
      // Scan for duplicate PSA certs in Shopify
      const { data: queryData, error: queryError } = await supabase
        .from('intake_items')
        .select('psa_cert, id, shopify_product_id, created_at, sku')
        .not('psa_cert', 'is', null)
        .neq('psa_cert', '')
        .not('shopify_product_id', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (queryError) throw queryError;

      // Group by PSA cert
      const grouped = queryData?.reduce((acc: Record<string, any[]>, item) => {
        if (!acc[item.psa_cert]) acc[item.psa_cert] = [];
        acc[item.psa_cert].push(item);
        return acc;
      }, {});

      const dupsArray = Object.entries(grouped || {})
        .filter(([_, items]) => items.length > 1)
        .map(([psa_cert, items]: [string, any[]]) => ({
          psa_cert,
          count: items.length,
          item_ids: items.map(i => i.id),
          shopify_product_ids: items.map(i => i.shopify_product_id),
          created_times: items.map(i => i.created_at),
          skus: items.map(i => i.sku)
        }));

      setDuplicates(dupsArray);
      toast.success(`Scan complete: ${dupsArray.length} duplicate groups found`);
    } catch (error: any) {
      console.error('Error scanning for duplicates:', error);
      toast.error('Failed to scan for duplicates: ' + error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const deleteDuplicate = async (duplicate: DuplicateGroup) => {
    setIsDeleting(duplicate.psa_cert);
    
    try {
      // Keep the oldest item (first in array), delete the rest
      const [keepId, ...deleteIds] = duplicate.item_ids;
      const [keepShopifyId, ...deleteShopifyIds] = duplicate.shopify_product_ids;

      // 1. Delete from Shopify (keep first, delete rest)
      for (let i = 0; i < deleteShopifyIds.length; i++) {
        const shopifyProductId = deleteShopifyIds[i];
        const itemId = deleteIds[i];
        
        if (shopifyProductId) {
          // Get store key and location from the item
          const { data: item } = await supabase
            .from('intake_items')
            .select('store_key, shopify_location_gid')
            .eq('id', itemId)
            .single();

          if (item?.store_key) {
            const { error: shopifyError } = await supabase.functions.invoke('shopify-delete-duplicates', {
              body: {
                storeKey: item.store_key,
                sku: duplicate.psa_cert,
                variants: [
                  {
                    productId: shopifyProductId.replace('gid://shopify/Product/', ''),
                    variantId: shopifyProductId.replace('gid://shopify/Product/', '')
                  }
                ]
              }
            });

            if (shopifyError) {
              logger.error('Shopify deletion error', shopifyError instanceof Error ? shopifyError : new Error(String(shopifyError)), undefined, 'duplicate-cleanup');
              toast.warning(`Failed to delete from Shopify: ${shopifyError.message}`);
            }
          }
        }
      }

      // 2. Soft delete duplicate items from database
      const { error: dbError } = await supabase
        .from('intake_items')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_reason: `Duplicate of PSA cert ${duplicate.psa_cert} - keeping oldest entry`,
          shopify_product_id: null,
          shopify_variant_id: null
        })
        .in('id', deleteIds);

      if (dbError) throw dbError;

      toast.success(`Deleted ${deleteIds.length} duplicate(s) for PSA cert ${duplicate.psa_cert}`);
      
      // Refresh the list
      await scanForDuplicates();
    } catch (error: any) {
      console.error('Error deleting duplicate:', error);
      toast.error('Failed to delete duplicate: ' + error.message);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Duplicate Cleanup Tool
        </CardTitle>
        <CardDescription>
          Scan for and remove duplicate entries in Shopify and inventory
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Button 
            onClick={scanForDuplicates} 
            disabled={isScanning}
            className="gap-2"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Scan for Duplicates
              </>
            )}
          </Button>
          
          {duplicates.length > 0 && (
            <Badge variant="destructive">
              {duplicates.length} duplicate group{duplicates.length !== 1 ? 's' : ''} found
            </Badge>
          )}
        </div>

        {duplicates.length === 0 && !isScanning && (
          <Alert>
            <CheckCircle className="w-4 h-4" />
            <AlertDescription>
              No duplicates found. Your inventory is clean!
            </AlertDescription>
          </Alert>
        )}

        {duplicates.length > 0 && (
          <div className="space-y-4">
            {duplicates.map((dup) => (
              <Card key={dup.psa_cert} className="border-destructive/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        PSA Cert: {dup.psa_cert}
                      </CardTitle>
                      <CardDescription>
                        {dup.count} duplicate entries found
                      </CardDescription>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteDuplicate(dup)}
                      disabled={isDeleting === dup.psa_cert}
                      className="gap-2"
                    >
                      {isDeleting === dup.psa_cert ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Delete Duplicates
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="font-medium">Item IDs:</span>
                        <div className="text-muted-foreground">
                          {dup.item_ids.map((id, idx) => (
                            <div key={id} className={idx === 0 ? 'text-green-600 font-medium' : ''}>
                              {id} {idx === 0 && '(Keep)'}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Created At:</span>
                        <div className="text-muted-foreground">
                          {dup.created_times.map((time, idx) => (
                            <div key={idx} className={idx === 0 ? 'text-green-600 font-medium' : ''}>
                              {new Date(time).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Shopify Product IDs:</span>
                      <div className="text-muted-foreground">
                        {dup.shopify_product_ids.join(', ')}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
