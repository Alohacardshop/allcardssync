import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, Zap } from "lucide-react";

export const CGCScrapePingCard = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handlePing = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      console.log('[CGC-PING] Starting ping test');
      const startTime = Date.now();
      
      const response = await fetch('/functions/v1/cgc-lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'ping' }),
      });
      
      const responseTime = Date.now() - startTime;
      const data = await response.json();
      
      console.log('[CGC-PING] Response:', { status: response.status, data, responseTime });
      
      setResult({
        success: response.ok && data.ok,
        status: response.status,
        data,
        responseTime,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[CGC-PING] Error:', error);
      setResult({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          CGC Scrape Ping
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePing}
            disabled={testing}
            size="sm"
            className="flex items-center gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {testing ? 'Testing...' : 'Ping CGC Function'}
          </Button>
          
          {result && (
            <Badge variant={result.success ? "default" : "destructive"} className="flex items-center gap-1">
              {result.success ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )}
              {result.success ? 'Reachable' : 'Failed'}
            </Badge>
          )}
        </div>

        {result && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Response Time: {result.responseTime ? `${result.responseTime}ms` : 'N/A'}
            </div>
            
            <div className="bg-muted p-3 rounded-md">
              <pre className="text-xs overflow-auto max-h-48">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Last tested: {new Date(result.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          This tests CGC function reachability without scraping. Expects: <code>{"{ ok: true, message: 'cgc-lookup reachable' }"}</code>
        </div>
      </CardContent>
    </Card>
  );
};