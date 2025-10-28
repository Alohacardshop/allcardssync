import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Webhook, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export function ShopifyWebhookStatus() {
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);

  const checkWebhookStatus = async () => {
    setChecking(true);
    try {
      // Check webhook configuration for both stores
      const stores = ['hawaii', 'las_vegas'];
      const allWebhooks: any[] = [];

      for (const storeKey of stores) {
        try {
          // Use edge function to check webhooks (avoids CORS issues)
          const { data, error } = await supabase.functions.invoke('shopify-webhook-check', {
            body: { storeKey }
          });

          if (error) {
            console.error(`Error fetching webhooks for ${storeKey}:`, error);
            toast.error(`Failed to check webhook status for ${storeKey}`);
            continue;
          }

          if (data?.webhooks) {
            allWebhooks.push({
              store: storeKey,
              webhooks: data.webhooks
            });
          }
        } catch (err) {
          console.error(`Exception checking ${storeKey}:`, err);
          toast.error(`Failed to check webhook status for ${storeKey}`);
        }
      }

      if (allWebhooks.length > 0) {
        setWebhooks(allWebhooks);
        toast.success('Webhook status loaded');
      } else {
        toast.error('No webhook data could be retrieved');
      }
    } catch (error) {
      console.error('Error checking webhook status:', error);
      toast.error('Failed to check webhook status');
    } finally {
      setChecking(false);
    }
  };

  const registerWebhooks = async (storeKey: string) => {
    setRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-webhook-register', {
        body: { storeKey, dryRun: false }
      });

      if (error) {
        console.error(`Error registering webhooks for ${storeKey}:`, error);
        toast.error(`Failed to register webhooks for ${storeKey}`);
        return;
      }

      const created = data?.created?.length || 0;
      const skipped = data?.skipped?.length || 0;
      const errors = data?.errors?.length || 0;

      if (created > 0) {
        toast.success(`Registered ${created} webhook(s) for ${storeKey}`);
      }
      if (errors > 0) {
        toast.error(`Failed to register ${errors} webhook(s) for ${storeKey}`);
      }
      if (created === 0 && errors === 0 && skipped > 0) {
        toast.info(`All webhooks already registered for ${storeKey}`);
      }

      // Refresh status after registration
      await checkWebhookStatus();
    } catch (error) {
      console.error('Error registering webhooks:', error);
      toast.error('Failed to register webhooks');
    } finally {
      setRegistering(false);
    }
  };

  const requiredTopics = [
    'orders/create',
    'orders/updated',
    'orders/cancelled',
    'orders/fulfilled',
    'inventory_levels/update',
    'inventory_items/update',
    'products/delete',
    'refunds/create'
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            <CardTitle>Webhook Status</CardTitle>
          </div>
          <Button onClick={checkWebhookStatus} disabled={checking} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            Check Status
          </Button>
        </div>
        <CardDescription>
          Monitor Shopify webhook registrations for inventory sync
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {webhooks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Click "Check Status" to verify webhook configuration
          </div>
        ) : (
          webhooks.map(({ store, webhooks: storeWebhooks }) => (
            <div key={store} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold capitalize">{store} Store</h3>
                <Badge variant={storeWebhooks.length > 0 ? 'default' : 'destructive'}>
                  {storeWebhooks.length} webhooks
                </Badge>
              </div>
              
              <div className="space-y-2 pl-4">
                {requiredTopics.map(topic => {
                  const isRegistered = storeWebhooks.some((w: any) => w.topic === topic);
                  return (
                    <div key={topic} className="flex items-center justify-between py-1">
                      <span className="text-sm font-mono">{topic}</span>
                      {isRegistered ? (
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          <span className="text-xs">Registered</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-destructive">
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs">Missing</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Register button for missing webhooks */}
              {storeWebhooks.length > 0 && requiredTopics.some(topic => !storeWebhooks.some((w: any) => w.topic === topic)) && (
                <div className="pl-4 pt-2">
                  <Button 
                    onClick={() => registerWebhooks(store)} 
                    disabled={registering}
                    size="sm"
                    variant="outline"
                  >
                    {registering ? 'Registering...' : 'Register Missing Webhooks'}
                  </Button>
                </div>
              )}
              
              {storeWebhooks.length > 0 && (
                <div className="text-xs text-muted-foreground pl-4">
                  Webhook URL: {storeWebhooks[0]?.address || 'N/A'}
                </div>
              )}
            </div>
          ))
        )}
        
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            <strong>Required webhooks:</strong> These webhooks enable real-time inventory sync when items are sold in Shopify.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
