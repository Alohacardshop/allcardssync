import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, PlayCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface TestResult {
  topic: string;
  status: number | string;
  success: boolean;
  response?: string;
  error?: string;
  payload: any;
}

interface TestSummary {
  total_tests: number;
  successful: number;
  failed: number;
  success_rate: string;
  results: TestResult[];
}

export function WebhookTestPanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestSummary | null>(null);

  const runWebhookTests = async () => {
    setIsRunning(true);
    setTestResults(null);

    try {
      logger.info('Starting webhook tests', undefined, 'webhook-test-panel');
      
      const { data, error } = await supabase.functions.invoke('shopify-webhook-test');
      
      if (error) {
        logger.error('Test function error', error instanceof Error ? error : new Error(String(error)), undefined, 'webhook-test-panel');
        toast.error('Failed to run webhook tests: ' + error.message);
        return;
      }

      if (data) {
        setTestResults(data);
        const successCount = data.successful || 0;
        const totalCount = data.total_tests || 0;
        
        if (successCount === totalCount) {
          toast.success(`All ${totalCount} webhook tests passed!`);
        } else {
          toast.warning(`${successCount}/${totalCount} webhook tests passed`);
        }
      }
    } catch (error) {
      logger.error('Unexpected error', error instanceof Error ? error : new Error(String(error)), undefined, 'webhook-test-panel');
      toast.error('Unexpected error running tests');
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusBadge = (result: TestResult) => {
    if (result.success) {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Success</Badge>;
    } else {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlayCircle className="w-5 h-5" />
          Webhook Test Suite
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Test all configured Shopify webhooks to ensure they're working properly
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <p>Tests the following webhooks:</p>
            <ul className="list-disc list-inside mt-1 text-xs text-muted-foreground">
              <li>Inventory levels update</li>
              <li>Orders paid</li>
              <li>Orders cancelled</li>
              <li>Refunds created</li>
              <li>Products updated</li>
              <li>Products deleted</li>
            </ul>
          </div>
          
          <Button 
            onClick={runWebhookTests}
            disabled={isRunning}
            className="min-w-[120px]"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4 mr-2" />
                Run Tests
              </>
            )}
          </Button>
        </div>

        {testResults && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="text-center">
                <div className="font-semibold text-lg">{testResults.total_tests}</div>
                <div className="text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-green-600">{testResults.successful}</div>
                <div className="text-muted-foreground">Passed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg text-red-600">{testResults.failed}</div>
                <div className="text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-lg">{testResults.success_rate}</div>
                <div className="text-muted-foreground">Success Rate</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Test Results:</h4>
              {testResults.results.map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{result.topic}</span>
                    {getStatusBadge(result)}
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">
                      Status: {result.status}
                    </div>
                    {result.error && (
                      <div className="text-red-600 text-xs mt-1">
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}