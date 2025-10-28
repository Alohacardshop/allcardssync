import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface ImportResult {
  total_found: number;
  already_synced: number;
  imported: number;
  errors: number;
  items: Array<{
    product_id: string;
    title: string;
    sku: string;
    status: string;
  }>;
}

export function ShopifyInventoryImport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [storeKey, setStoreKey] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [limit, setLimit] = useState<number>(50);
  const [result, setResult] = useState<ImportResult | null>(null);

  const runImport = async () => {
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
      const { data, error } = await supabase.functions.invoke('shopify-import-inventory', {
        body: {
          store_key: storeKey,
          location_id: locationId || undefined,
          collection_id: collectionId || undefined,
          limit,
          dry_run: dryRun,
        },
      });

      if (error) throw error;

      setResult(data.result);
      
      toast({
        title: dryRun ? 'Preview Complete' : 'Import Complete',
        description: data.message,
      });
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'already_synced':
      case 'linked':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'would_link':
        return <CheckCircle className="h-4 w-4 text-blue-600" />;
      case 'not_in_database':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      already_synced: 'Already Synced',
      linked: 'Linked',
      would_link: 'Would Link',
      not_in_database: 'Not in Database',
      error: 'Error',
    };
    return labels[status] || status;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Import Shopify Inventory
        </CardTitle>
        <CardDescription>
          Pull existing Shopify products into your inventory system and link them by SKU
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            This tool finds products in Shopify and links them to your database items by matching SKUs.
            Items already in your system will be updated with Shopify IDs. Items only in Shopify will be reported.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Store *</label>
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
              <label className="text-sm font-medium">Limit</label>
              <Input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                min={1}
                max={250}
              />
              <p className="text-xs text-muted-foreground">Max 250 products per import</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Location ID (Optional)</label>
              <Input
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                placeholder="gid://shopify/Location/..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Collection ID (Optional)</label>
              <Input
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                placeholder="gid://shopify/Collection/..."
              />
            </div>
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
                  Dry Run (Preview Only)
                </SelectItem>
                <SelectItem value="live">
                  Live Mode (Import & Link)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {dryRun 
                ? 'Preview what would be imported without making changes'
                : 'Link Shopify products to database items by SKU'
              }
            </p>
          </div>

          <Button 
            onClick={runImport} 
            disabled={loading || !storeKey}
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dryRun ? 'Preview Import' : 'Run Import'}
          </Button>
        </div>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Found</div>
                <div className="text-2xl font-bold">{result.total_found}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Already Synced</div>
                <div className="text-2xl font-bold text-green-600">
                  {result.already_synced}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">
                  {dryRun ? 'Would Link' : 'Imported'}
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {result.imported}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Errors</div>
                <div className="text-2xl font-bold text-red-600">
                  {result.errors}
                </div>
              </div>
            </div>

            {result.items.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Items</h4>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {result.items.slice(0, 50).map((item, idx) => (
                    <div 
                      key={idx} 
                      className="p-3 bg-muted rounded-lg flex items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-medium truncate">{item.title}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          SKU: {item.sku}
                        </div>
                      </div>
                      <Badge 
                        variant={
                          ['already_synced', 'linked'].includes(item.status) ? 'default' :
                          item.status === 'would_link' ? 'secondary' :
                          item.status === 'not_in_database' ? 'outline' :
                          'destructive'
                        }
                        className="flex items-center gap-1 shrink-0"
                      >
                        {getStatusIcon(item.status)}
                        {getStatusLabel(item.status)}
                      </Badge>
                    </div>
                  ))}
                  {result.items.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center">
                      Showing first 50 of {result.items.length} items
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}