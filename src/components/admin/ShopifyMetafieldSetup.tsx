import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tag, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SetupResult {
  storeKey: string;
  success: boolean;
  totalDefinitions: number;
  successCount: number;
  failedCount: number;
  results: Array<{
    key: string;
    name: string;
    success: boolean;
    errors?: any[];
  }>;
}

export function ShopifyMetafieldSetup() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const handleSetup = async (storeKey: string) => {
    setLoading(prev => ({ ...prev, [storeKey]: true }));

    try {
      const { data, error } = await supabase.functions.invoke(
        'shopify-create-metafield-definitions',
        { body: { storeKey } }
      );

      if (error) throw error;

      const result = data as SetupResult;

      if (result.success && result.successCount === result.totalDefinitions) {
        toast({
          title: '✓ Metafield definitions created',
          description: `Successfully created ${result.successCount}/${result.totalDefinitions} metafield definitions for ${storeKey.toUpperCase()} store.`,
        });
      } else if (result.successCount > 0) {
        toast({
          title: '⚠️ Partial success',
          description: `Created ${result.successCount}/${result.totalDefinitions} metafield definitions. ${result.failedCount} failed - check details below.`,
          variant: 'default',
        });
      } else {
        toast({
          title: '❌ Failed to create metafield definitions',
          description: 'No metafield definitions were created. See console for details.',
          variant: 'destructive',
        });
      }

      // Log detailed results for debugging
      console.log('Metafield setup results:', result.results);

    } catch (error: any) {
      console.error('Error setting up metafield definitions:', error);
      toast({
        title: '❌ Setup failed',
        description: error.message || 'Failed to create metafield definitions',
        variant: 'destructive',
      });
    } finally {
      setLoading(prev => ({ ...prev, [storeKey]: false }));
    }
  };

  const metafieldCategories = [
    {
      title: 'Core Tracking',
      items: ['External ID', 'Intake ID']
    },
    {
      title: 'Classification',
      items: ['Main Category', 'Sub Category', 'Item Type']
    },
    {
      title: 'Grading Information',
      items: ['Grading Company', 'Grade', 'Certificate Number', 'Certificate URL (Public)']
    },
    {
      title: 'Card Details',
      items: ['Brand/Set Title', 'Card Number', 'Year', 'Variant', 'Subject', 'Rarity']
    },
    {
      title: 'Rich Metadata',
      items: ['Catalog Snapshot (JSON)', 'PSA Snapshot (JSON)', 'Grading Data (JSON)']
    }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-primary" />
          <CardTitle>Shopify Metafield Setup</CardTitle>
        </div>
        <CardDescription>
          Initialize metafield definitions for enriched product data in Shopify stores
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This will create 18 metafield definitions in your Shopify store to enable rich product metadata:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metafieldCategories.map((category) => (
              <div key={category.title} className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground">{category.title}</h4>
                <ul className="space-y-1">
                  {category.items.map((item) => (
                    <li key={item} className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Benefits
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6">
              <li>• Certificate URLs visible on storefront</li>
              <li>• Enhanced search and filtering in Shopify admin</li>
              <li>• Rich product metadata for better SEO</li>
              <li>• Idempotent - safe to run multiple times</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => handleSetup('hawaii')}
            disabled={loading['hawaii']}
            className="flex-1"
          >
            {loading['hawaii'] ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Tag className="w-4 h-4 mr-2" />
                Setup Hawaii Store
              </>
            )}
          </Button>

          <Button
            onClick={() => handleSetup('lasvegas')}
            disabled={loading['lasvegas']}
            className="flex-1"
          >
            {loading['lasvegas'] ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Tag className="w-4 h-4 mr-2" />
                Setup Las Vegas Store
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>Note: This operation requires admin permissions and valid Shopify credentials for each store.</p>
        </div>
      </CardContent>
    </Card>
  );
}
