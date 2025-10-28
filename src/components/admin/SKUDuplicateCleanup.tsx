import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

interface DuplicateSKUGroup {
  sku: string;
  count: number;
  items: Array<{
    id: string;
    sku: string;
    created_at: string;
    type: string;
    subject: string;
    shopify_product_id: string | null;
    shopify_variant_id: string | null;
    store_key: string | null;
    grade: string | null;
    psa_cert: string | null;
    psa_cert_number: string | null;
    cgc_cert: string | null;
  }>;
}

export function SKUDuplicateCleanup() {
  const [duplicates, setDuplicates] = useState<DuplicateSKUGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const scanForDuplicates = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select('id, sku, created_at, type, subject, shopify_product_id, shopify_variant_id, store_key, grade, psa_cert, psa_cert_number, cgc_cert')
        .is('deleted_at', null)
        .not('sku', 'is', null)
        .order('sku')
        .order('created_at');

      if (error) throw error;

      // Group by SKU and find duplicates
      const groups = new Map<string, DuplicateSKUGroup>();
      
      data?.forEach(item => {
        if (!item.sku) return;
        
        if (!groups.has(item.sku)) {
          groups.set(item.sku, {
            sku: item.sku,
            count: 0,
            items: []
          });
        }
        
        const group = groups.get(item.sku)!;
        group.count++;
        group.items.push(item);
      });

      // Filter to only duplicates (count > 1)
      const dupeGroups = Array.from(groups.values()).filter(g => g.count > 1);
      
      setDuplicates(dupeGroups);
      toast.success(`Found ${dupeGroups.length} SKUs with duplicates`);
    } catch (error) {
      console.error('Error scanning for duplicates:', error);
      toast.error('Failed to scan for duplicates');
    } finally {
      setIsScanning(false);
    }
  };

  const cleanupDuplicates = async (sku: string) => {
    setIsDeleting(prev => ({ ...prev, [sku]: true }));
    
    try {
      const group = duplicates.find(d => d.sku === sku);
      if (!group) return;

      // Sort by created_at to keep the oldest
      const sorted = [...group.items].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      const keepItem = sorted[0];
      const deleteItems = sorted.slice(1);

      console.log(`Keeping oldest item ${keepItem.id}, deleting ${deleteItems.length} duplicates`);

      let shopifySuccessCount = 0;
      let shopifyFailCount = 0;
      const deleteIds: string[] = [];

      // Process each duplicate item
      for (const item of deleteItems) {
        deleteIds.push(item.id);

        // Handle Shopify removal if item exists in Shopify
        if (item.shopify_product_id && item.store_key) {
          try {
            // Determine if item is graded
            const isGraded = item.type === 'Graded' || 
                           item.grade || 
                           item.psa_cert || 
                           item.psa_cert_number ||
                           item.cgc_cert;

            const functionName = isGraded 
              ? 'v2-shopify-remove-graded'
              : 'v2-shopify-remove-raw';

            console.log(`Removing ${item.id} from Shopify using ${functionName}`);

            const { error: shopifyError } = await supabase.functions.invoke(
              functionName,
              {
                body: {
                  item_id: item.id,
                  sku: item.sku
                }
              }
            );

            if (shopifyError) {
              console.warn(`Shopify removal failed for ${item.id}:`, shopifyError);
              shopifyFailCount++;
            } else {
              shopifySuccessCount++;
            }
          } catch (shopifyErr) {
            console.warn(`Shopify removal error for ${item.id}:`, shopifyErr);
            shopifyFailCount++;
          }
        }
      }

      // Soft delete from database (Edge functions mark as sold, we add soft-delete fields)
      if (deleteIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('intake_items')
          .update({ 
            deleted_at: new Date().toISOString(),
            deleted_reason: `Duplicate SKU - kept item ${keepItem.id}`,
            updated_by: 'admin_duplicate_cleanup',
            updated_at: new Date().toISOString()
          })
          .in('id', deleteIds);

        if (deleteError) throw deleteError;
      }

      // Show detailed results
      const messages = [`Deleted ${deleteItems.length} duplicates for SKU ${sku}`];
      if (shopifySuccessCount > 0) {
        messages.push(`${shopifySuccessCount} removed from Shopify`);
      }
      if (shopifyFailCount > 0) {
        messages.push(`${shopifyFailCount} Shopify removals failed`);
      }

      toast.success(messages.join(', '));
      
      // Remove from display
      setDuplicates(prev => prev.filter(d => d.sku !== sku));
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      toast.error('Failed to cleanup duplicates');
    } finally {
      setIsDeleting(prev => ({ ...prev, [sku]: false }));
    }
  };

  const cleanupAllDuplicates = async () => {
    if (!confirm(`Are you sure you want to delete ALL ${duplicates.length} duplicate SKU groups? This will keep the oldest item for each SKU and delete all newer duplicates.`)) {
      return;
    }

    setIsDeletingAll(true);

    try {
      // Process all groups in parallel for efficiency
      const results = await Promise.allSettled(
        duplicates.map(async (group) => {
          // Create a temporary state update for this group
          setIsDeleting(prev => ({ ...prev, [group.sku]: true }));
          
          try {
            const sorted = [...group.items].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            
            const keepItem = sorted[0];
            const deleteItems = sorted.slice(1);
            const deleteIds: string[] = [];
            let shopifySuccessCount = 0;
            let shopifyFailCount = 0;

            // Process Shopify removals for each duplicate
            for (const item of deleteItems) {
              deleteIds.push(item.id);

              if (item.shopify_product_id && item.store_key) {
                try {
                  const isGraded = item.type === 'Graded' || 
                                 item.grade || 
                                 item.psa_cert || 
                                 item.psa_cert_number ||
                                 item.cgc_cert;

                  const functionName = isGraded 
                    ? 'v2-shopify-remove-graded'
                    : 'v2-shopify-remove-raw';

                  const { error: shopifyError } = await supabase.functions.invoke(
                    functionName,
                    { body: { item_id: item.id, sku: item.sku } }
                  );

                  if (shopifyError) {
                    shopifyFailCount++;
                  } else {
                    shopifySuccessCount++;
                  }
                } catch {
                  shopifyFailCount++;
                }
              }
            }

            // Soft delete from database (Edge functions mark as sold, we add soft-delete fields)
            if (deleteIds.length > 0) {
              const { error: deleteError } = await supabase
                .from('intake_items')
                .update({ 
                  deleted_at: new Date().toISOString(),
                  deleted_reason: `Duplicate SKU - kept item ${keepItem.id}`,
                  updated_by: 'admin_duplicate_cleanup',
                  updated_at: new Date().toISOString()
                })
                .in('id', deleteIds);

              if (deleteError) throw deleteError;
            }

            return {
              sku: group.sku,
              deletedCount: deleteItems.length,
              shopifySuccessCount,
              shopifyFailCount
            };
          } finally {
            setIsDeleting(prev => ({ ...prev, [group.sku]: false }));
          }
        })
      );

      // Count results
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      let totalDeleted = 0;
      let totalShopifySuccess = 0;
      let totalShopifyFail = 0;

      successful.forEach(result => {
        if (result.status === 'fulfilled') {
          totalDeleted += result.value.deletedCount;
          totalShopifySuccess += result.value.shopifySuccessCount;
          totalShopifyFail += result.value.shopifyFailCount;
        }
      });

      // Show comprehensive results
      const messages = [];
      if (successful.length > 0) {
        messages.push(`✓ Cleaned up ${successful.length} SKU groups (${totalDeleted} items)`);
      }
      if (totalShopifySuccess > 0) {
        messages.push(`✓ ${totalShopifySuccess} removed from Shopify`);
      }
      if (totalShopifyFail > 0) {
        messages.push(`⚠ ${totalShopifyFail} Shopify removals failed`);
      }
      if (failed.length > 0) {
        messages.push(`✗ ${failed.length} groups failed to process`);
      }

      if (successful.length > 0) {
        toast.success(messages.join('\n'));
      }
      if (failed.length > 0) {
        toast.error(`Failed to cleanup ${failed.length} SKU groups`);
      }

      // Clear duplicates list
      setDuplicates([]);
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          SKU Duplicate Cleanup
        </CardTitle>
        <CardDescription>
          Find and remove duplicate SKUs, keeping the oldest entry
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={scanForDuplicates} 
            disabled={isScanning}
            className="flex-1"
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              'Scan for Duplicate SKUs'
            )}
          </Button>

          {duplicates.length > 0 && (
            <Button 
              onClick={cleanupAllDuplicates} 
              disabled={isDeletingAll || isScanning}
              variant="destructive"
              className="flex-1"
            >
              {isDeletingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting All...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All Duplicates
                </>
              )}
            </Button>
          )}
        </div>

        {duplicates.length > 0 && (
          <Badge variant="destructive" className="w-full justify-center">
            {duplicates.length} SKUs with duplicates found
          </Badge>
        )}

        {duplicates.length === 0 && !isScanning && (
          <Alert>
            <AlertDescription>
              No duplicate SKUs found. Click "Scan" to check for duplicates.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {duplicates.map(group => (
            <Card key={group.sku}>
              <CardHeader>
                <CardTitle className="text-base">SKU: {group.sku}</CardTitle>
                <CardDescription>
                  {group.count} items found - Will keep oldest, delete {group.count - 1}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.items.map((item, idx) => (
                  <div 
                    key={item.id} 
                    className={`p-3 rounded-lg border ${
                      idx === 0 
                        ? 'border-green-500 bg-green-50 dark:bg-green-950' 
                        : 'border-red-500 bg-red-50 dark:bg-red-950'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-medium text-sm">
                          {idx === 0 ? '✓ KEEP' : '✗ DELETE'} - {item.subject || 'Untitled'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(item.created_at).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Type: {item.type} | ID: {item.id.slice(0, 8)}
                        </div>
                        {item.shopify_product_id && (
                          <div className="text-xs text-muted-foreground">
                            Shopify: {item.shopify_product_id.slice(0, 16)}...
                          </div>
                        )}
                      </div>
                      {idx === 0 && (
                        <Badge variant="secondary">Oldest</Badge>
                      )}
                    </div>
                  </div>
                ))}

                <Button
                  onClick={() => cleanupDuplicates(group.sku)}
                  disabled={isDeleting[group.sku]}
                  variant="destructive"
                  className="w-full"
                >
                  {isDeleting[group.sku] ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cleaning up...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete {group.count - 1} Duplicate{group.count > 2 ? 's' : ''}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
