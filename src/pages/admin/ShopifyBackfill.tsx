import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ShopifyBackfill() {
  const navigate = useNavigate();
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
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <PageHeader
        title="Shopify Inventory Backfill"
        description="Pull all products from Shopify with valid SKUs and inventory quantity > 0"
        showEcosystem
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        }
      />
      
      <Alert className="mb-6 mt-6">
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
