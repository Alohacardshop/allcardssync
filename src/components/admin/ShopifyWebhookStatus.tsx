import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Webhook, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export function ShopifyWebhookStatus() {
  const [checking, setChecking] = useState(false);
  const [webhooks, setWebhooks] = useState<any[]>([]);

  const checkWebhookStatus = async () => {
    setChecking(true);
    try {
      // Check webhook configuration for both stores
      const stores = ['hawaii', 'lasvegas'];
      const allWebhooks: any[] = [];

      for (const storeKey of stores) {
        const storeUpper = storeKey.toUpperCase();
        
        // Get store credentials
        const { data: domainSetting } = await supabase
          .from('system_settings')
          .select('key_value')
          .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
          .single();
        
        const { data: tokenSetting } = await supabase
          .from('system_settings')
          .select('key_value')
          .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
          .single();
        
        const domain = domainSetting?.key_value;
        const token = tokenSetting?.key_value;

        if (!domain || !token) {
          console.warn(`Missing credentials for ${storeKey}`);
          continue;
        }

        // Fetch webhooks from Shopify
        const response = await fetch(`https://${domain}/admin/api/2024-07/webhooks.json`, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch webhooks for ${storeKey}`);
        }

        const data = await response.json();
        allWebhooks.push({
          store: storeKey,
          webhooks: data.webhooks || []
        });
      }

      setWebhooks(allWebhooks);
      toast.success('Webhook status loaded');
    } catch (error) {
      console.error('Error checking webhook status:', error);
      toast.error('Failed to check webhook status');
    } finally {
      setChecking(false);
    }
  };

  const requiredTopics = [
    'orders/paid',
    'orders/cancelled',
    'orders/fulfilled',
    'inventory_levels/update',
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
