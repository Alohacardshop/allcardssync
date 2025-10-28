import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'running';
  details: any;
}

export function ShopifyIntegrationTest() {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);

  const runTests = async () => {
    setTesting(true);
    setResults([]);
    const testResults: TestResult[] = [];

    try {
      // Test 1: Verify Configuration
      testResults.push({ name: 'Configuration Check', status: 'running', details: {} });
      setResults([...testResults]);

      const { data: configData, error: configError } = await supabase.functions.invoke('shopify-config-check', {
        body: { storeKey: 'hawaii' }
      });

      if (configError) throw configError;

      testResults[0] = {
        name: 'Configuration Check',
        status: configData.hasAdminToken && configData.shop ? 'passed' : 'failed',
        details: {
          domain: configData.storeDomain,
          hasToken: configData.hasAdminToken,
          hasSecret: configData.hasWebhookSecret,
          shopName: configData.shop?.name,
          locations: configData.locations?.length || 0
        }
      };
      setResults([...testResults]);

      // Test 2: Fetch Locations
      testResults.push({ name: 'Locations Fetch', status: 'running', details: {} });
      setResults([...testResults]);

      const { data: locData, error: locError } = await supabase.functions.invoke('shopify-locations', {
        body: { storeKey: 'hawaii' }
      });

      if (locError) throw locError;

      testResults[1] = {
        name: 'Locations Fetch',
        status: locData.locations?.length > 0 ? 'passed' : 'failed',
        details: {
          count: locData.locations?.length || 0,
          locations: locData.locations?.map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            active: loc.active
          }))
        }
      };
      setResults([...testResults]);

      // Test 3: Check Recent Webhooks
      testResults.push({ name: 'Recent Webhooks', status: 'running', details: {} });
      setResults([...testResults]);

      const { data: webhooks } = await supabase
        .from('webhook_events')
        .select('event_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      const last24hrs = webhooks?.filter(w => 
        new Date(w.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      );

      testResults[2] = {
        name: 'Recent Webhooks',
        status: last24hrs && last24hrs.length > 0 ? 'passed' : 'warning',
        details: {
          last24Hours: last24hrs?.length || 0,
          recentTypes: [...new Set(last24hrs?.map(w => w.event_type) || [])],
          lastWebhook: webhooks?.[0]?.created_at
        }
      };
      setResults([...testResults]);

      // Test 4: Check HMAC Validation Logs
      testResults.push({ name: 'HMAC Security', status: 'running', details: {} });
      setResults([...testResults]);

      const { data: hmacLogs } = await supabase
        .from('system_logs')
        .select('level, message, created_at')
        .like('message', '%HMAC%')
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      const recentFailures = hmacLogs?.filter(log => 
        log.message.includes('validation failed')
      );

      testResults[3] = {
        name: 'HMAC Security',
        status: recentFailures && recentFailures.length === 0 ? 'passed' : 'warning',
        details: {
          recentFailures: recentFailures?.length || 0,
          lastHour: hmacLogs?.length || 0,
          message: recentFailures && recentFailures.length > 0 
            ? 'Recent HMAC validation failures detected'
            : 'No recent HMAC failures'
        }
      };
      setResults([...testResults]);

      // Test 5: Inventory Sync Status
      testResults.push({ name: 'Inventory Sync', status: 'running', details: {} });
      setResults([...testResults]);

      const { data: inventory } = await supabase
        .from('intake_items')
        .select('store_key, shopify_product_id, shopify_sync_status')
        .eq('store_key', 'hawaii')
        .not('shopify_product_id', 'is', null)
        .limit(100);

      const syncedCount = inventory?.filter(i => i.shopify_sync_status === 'synced').length || 0;
      const totalSynced = inventory?.length || 0;

      testResults[4] = {
        name: 'Inventory Sync',
        status: totalSynced > 0 ? 'passed' : 'warning',
        details: {
          totalSynced,
          syncedStatus: syncedCount,
          syncRate: totalSynced > 0 ? `${Math.round((syncedCount / totalSynced) * 100)}%` : 'N/A'
        }
      };
      setResults([...testResults]);

      const allPassed = testResults.every(r => r.status === 'passed');
      const anyFailed = testResults.some(r => r.status === 'failed');

      if (allPassed) {
        toast.success("All tests passed! Shopify integration is working correctly.");
      } else if (anyFailed) {
        toast.error("Some tests failed. Check the results below.");
      } else {
        toast.warning("Tests completed with warnings. Review the details.");
      }

    } catch (error) {
      console.error('Test error:', error);
      toast.error(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTesting(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    const variants: Record<TestResult['status'], any> = {
      passed: 'default',
      failed: 'destructive',
      warning: 'secondary',
      running: 'outline'
    };
    return (
      <Badge variant={variants[status]}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shopify Integration Test Suite</CardTitle>
        <CardDescription>
          Comprehensive tests for webhook security, configuration, and sync status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runTests} 
          disabled={testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Tests...
            </>
          ) : (
            'Run Integration Tests'
          )}
        </Button>

        {results.length > 0 && (
          <div className="space-y-3 mt-4">
            {results.map((result, idx) => (
              <Card key={idx} className="border-2">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="font-medium">{result.name}</span>
                    </div>
                    {getStatusBadge(result.status)}
                  </div>
                  
                  {result.details && Object.keys(result.details).length > 0 && (
                    <div className="mt-2 text-sm text-muted-foreground bg-muted p-3 rounded">
                      <pre className="whitespace-pre-wrap font-mono text-xs">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {results.length > 0 && !testing && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Test Summary</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-green-600 font-medium">
                  {results.filter(r => r.status === 'passed').length}
                </span>
                {' '}Passed
              </div>
              <div>
                <span className="text-red-600 font-medium">
                  {results.filter(r => r.status === 'failed').length}
                </span>
                {' '}Failed
              </div>
              <div>
                <span className="text-yellow-600 font-medium">
                  {results.filter(r => r.status === 'warning').length}
                </span>
                {' '}Warnings
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
