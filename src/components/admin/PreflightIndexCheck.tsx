import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, Loader2, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DuplicateResult {
  id: string;
  sku: string | null;
  shopify_product_id: string | null;
  store_key: string | null;
}

interface CheckResults {
  shopifyProductIdDupes: DuplicateResult[];
  skuDupes: DuplicateResult[];
}

export function PreflightIndexCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<CheckResults | null>(null);

  const runCheck = async () => {
    setIsChecking(true);
    setResults(null);

    try {
      // Check 1: Active dupes by shopify_product_id
      const { data: shopifyDupes, error: shopifyError } = await supabase.rpc(
        'check_shopify_product_id_dupes' as any
      );
      
      if (shopifyError) {
        console.error('Shopify product ID check failed:', shopifyError);
        toast.error('Failed to check Shopify product ID duplicates');
        return;
      }

      // Check 2: Active dupes for Raw by (store_key, sku)
      const { data: skuDupes, error: skuError } = await supabase.rpc(
        'check_sku_dupes' as any
      );
      
      if (skuError) {
        console.error('SKU check failed:', skuError);
        toast.error('Failed to check SKU duplicates');
        return;
      }

      const checkResults: CheckResults = {
        shopifyProductIdDupes: (shopifyDupes as DuplicateResult[]) || [],
        skuDupes: (skuDupes as DuplicateResult[]) || []
      };

      setResults(checkResults);

      const totalDupes = checkResults.shopifyProductIdDupes.length + checkResults.skuDupes.length;
      
      if (totalDupes === 0) {
        toast.success('✓ All checks passed - no duplicates found');
      } else {
        toast.warning(`Found ${totalDupes} duplicate entries that need attention`);
      }
    } catch (error: any) {
      console.error('Pre-flight check error:', error);
      toast.error('Failed to run pre-flight checks: ' + error.message);
    } finally {
      setIsChecking(false);
    }
  };

  const totalDupes = results 
    ? results.shopifyProductIdDupes.length + results.skuDupes.length 
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Pre-flight Index Check
        </CardTitle>
        <CardDescription>
          Verify database integrity before applying unique indexes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runCheck}
          disabled={isChecking}
          className="w-full"
        >
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Checks...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Run Pre-flight Checks
            </>
          )}
        </Button>

        {results && totalDupes !== null && (
          <>
            {totalDupes === 0 ? (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  ✓ All checks passed - database is ready for unique indexes
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Found {totalDupes} duplicate entries that must be resolved before applying indexes
                </AlertDescription>
              </Alert>
            )}

            {/* Shopify Product ID Duplicates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Shopify Product ID Duplicates</h3>
                <Badge variant={results.shopifyProductIdDupes.length === 0 ? 'secondary' : 'destructive'}>
                  {results.shopifyProductIdDupes.length}
                </Badge>
              </div>
              
              {results.shopifyProductIdDupes.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
                  {results.shopifyProductIdDupes.map((dupe) => (
                    <div key={dupe.id} className="text-xs font-mono bg-muted p-2 rounded">
                      <div>ID: {dupe.id}</div>
                      <div>Shopify: {dupe.shopify_product_id}</div>
                      <div>SKU: {dupe.sku || 'N/A'}</div>
                      <div>Store: {dupe.store_key || 'N/A'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SKU Duplicates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">SKU Duplicates (Raw Items)</h3>
                <Badge variant={results.skuDupes.length === 0 ? 'secondary' : 'destructive'}>
                  {results.skuDupes.length}
                </Badge>
              </div>
              
              {results.skuDupes.length > 0 && (
                <div className="rounded-lg border p-3 space-y-2 max-h-48 overflow-y-auto">
                  {results.skuDupes.map((dupe) => (
                    <div key={dupe.id} className="text-xs font-mono bg-muted p-2 rounded">
                      <div>ID: {dupe.id}</div>
                      <div>SKU: {dupe.sku}</div>
                      <div>Store: {dupe.store_key}</div>
                      <div>Shopify: {dupe.shopify_product_id || 'N/A'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totalDupes > 0 && (
              <Alert>
                <AlertDescription className="text-sm">
                  Use the Duplicate Cleanup tools above to resolve these issues before applying unique indexes.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
