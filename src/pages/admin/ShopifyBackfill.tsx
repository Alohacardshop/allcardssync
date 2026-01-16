import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function ShopifyBackfill() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});

  const runBackfill = async (storeKey: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-pull-products-by-tags', {
        body: {
          storeKey,
          skipAlreadyPulled: false, // Full backfill
          status: 'active',
          maxPages: 100, // Pull up to 100 pages (25,000 products)
          dryRun: false
        }
      });

      if (error) throw error;

      setResults(prev => ({ ...prev, [storeKey]: data }));
    } catch (error: any) {
      setResults(prev => ({ 
        ...prev, 
        [storeKey]: { error: error.message } 
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Shopify Inventory Backfill</h1>
      
      <Alert className="mb-6">
        <AlertDescription>
          This will pull ALL products from Shopify that have valid SKUs and inventory quantity {">"} 0.
          Products without locations or 0 quantity will be skipped.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Las Vegas Store</CardTitle>
            <CardDescription>Pull all inventory from las_vegas store</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => runBackfill('las_vegas')} 
              disabled={loading}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Run Backfill'}
            </Button>
            
            {results.las_vegas && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <pre className="text-xs overflow-auto max-h-96">
                  {JSON.stringify(results.las_vegas, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hawaii Store</CardTitle>
            <CardDescription>Pull all inventory from hawaii_store</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => runBackfill('hawaii_store')} 
              disabled={loading}
              className="w-full"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Run Backfill'}
            </Button>
            
            {results.hawaii_store && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <pre className="text-xs overflow-auto max-h-96">
                  {JSON.stringify(results.hawaii_store, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Button 
          onClick={() => {
            runBackfill('las_vegas');
            setTimeout(() => runBackfill('hawaii_store'), 1000);
          }}
          disabled={loading}
          variant="default"
          className="w-full"
          size="lg"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Run Both Backfills'}
        </Button>
      </div>
    </div>
  );
}
