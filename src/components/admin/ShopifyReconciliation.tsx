import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ReconcileResult {
  checked: number;
  missing_in_shopify: number;
  cleaned: number;
  errors: number;
  missing_items: Array<{
    id: string;
    sku: string;
    shopify_product_id: string;
    action_taken: string;
  }>;
}

export function ShopifyReconciliation() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [storeKey, setStoreKey] = useState<string>('');
  const [result, setResult] = useState<ReconcileResult | null>(null);

  const runReconciliation = async () => {
    if (!storeKey) {
      toast({
        title: 'Store Required',
        description: 'Please select a store first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('shopify-reconcile-inventory', {
        body: {
          store_key: storeKey,
          batch_size: 50,
          dry_run: dryRun,
        },
      });

      if (error) throw error;

      setResult(data.result);
      
      toast({
        title: dryRun ? 'Audit Complete' : 'Reconciliation Complete',
        description: data.message,
      });
    } catch (error) {
      console.error('Reconciliation error:', error);
      toast({
        title: 'Reconciliation Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Shopify Inventory Reconciliation
        </CardTitle>
        <CardDescription>
          Audit your inventory against Shopify and clean up orphaned records
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            This tool checks if items in your database still exist in Shopify. Items that are deleted
            in Shopify but still reference a Shopify product ID will be cleaned up.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Store</label>
            <Select value={storeKey} onValueChange={setStoreKey}>
              <SelectTrigger>
                <SelectValue placeholder="Select a store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wardave">Ward Ave</SelectItem>
                <SelectItem value="justgraded">JustGraded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Mode</label>
            <Select 
              value={dryRun ? 'dry_run' : 'live'} 
              onValueChange={(v) => setDryRun(v === 'dry_run')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dry_run">
                  Dry Run (Audit Only)
                </SelectItem>
                <SelectItem value="live">
                  Live Mode (Clean Up Items)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {dryRun 
                ? 'Check for orphaned items without making changes'
                : 'Clear Shopify IDs from items that no longer exist in Shopify'
              }
            </p>
          </div>

          <Button 
            onClick={runReconciliation} 
            disabled={loading || !storeKey}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dryRun ? 'Run Audit' : 'Run Reconciliation'}
          </Button>
        </div>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Items Checked</div>
                <div className="text-2xl font-bold">{result.checked}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Missing in Shopify</div>
                <div className="text-2xl font-bold text-orange-600">
                  {result.missing_in_shopify}
                </div>
              </div>
              {!dryRun && (
                <>
                  <div>
                    <div className="text-sm text-muted-foreground">Cleaned</div>
                    <div className="text-2xl font-bold text-green-600">
                      {result.cleaned}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Errors</div>
                    <div className="text-2xl font-bold text-red-600">
                      {result.errors}
                    </div>
                  </div>
                </>
              )}
            </div>

            {result.missing_items.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Orphaned Items
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {result.missing_items.map((item) => (
                    <div 
                      key={item.id} 
                      className="p-3 bg-muted rounded-lg flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="font-mono text-sm">{item.sku}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.shopify_product_id}
                        </div>
                      </div>
                      <Badge variant={
                        item.action_taken === 'cleaned' ? 'default' :
                        item.action_taken === 'detected' ? 'secondary' :
                        'destructive'
                      }>
                        {item.action_taken === 'cleaned' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {item.action_taken}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.missing_in_shopify === 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  All items are in sync with Shopify. No orphaned records found.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}