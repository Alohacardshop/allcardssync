import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye, EyeOff } from "lucide-react";

export function PSAApiSettings() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [currentStatus, setCurrentStatus] = useState<{
    hasToken: boolean;
    source: 'database' | 'environment' | 'none';
    lastTested?: Date;
  }>({ hasToken: false, source: 'none' });
  const [currentToken, setCurrentToken] = useState<string>('');
  const [showCurrentToken, setShowCurrentToken] = useState(false);
  const [loadingCurrentToken, setLoadingCurrentToken] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkCurrentTokenStatus();
  }, []);

  const checkCurrentTokenStatus = async () => {
    try {
      // Use the get-system-setting edge function to check token status
      const { data, error } = await supabase.functions.invoke('get-system-setting', {
        body: { 
          keyName: 'PSA_API_TOKEN',
          fallbackSecretName: 'PSA_API_TOKEN'
        }
      });

      if (error) {
        console.error('Error checking token status:', error);
        setCurrentStatus({ hasToken: false, source: 'none' });
        return;
      }

      if (data?.value) {
        // Determine source based on response
        const source = data.source || 'database';
        setCurrentStatus({
          hasToken: true,
          source: source as 'database' | 'environment',
          lastTested: data.lastUpdated ? new Date(data.lastUpdated) : undefined
        });
      } else {
        setCurrentStatus({
          hasToken: false,
          source: 'none'
        });
      }
    } catch (error) {
      console.error('Error checking token status:', error);
      setCurrentStatus({ hasToken: false, source: 'none' });
    }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) {
      toast({
        title: "Error",
        description: "Please enter a PSA API token",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    
    // Set timeout for the operation
    const timeoutId = setTimeout(() => {
      setLoading(false);
      toast({
        title: "Error",
        description: "Save operation timed out. Please try again.",
        variant: "destructive"
      });
    }, 10000); // 10 second timeout

    try {
      const { data, error } = await supabase.functions.invoke('set-system-setting', {
        body: {
          keyName: 'PSA_API_TOKEN',
          keyValue: token.trim(),
          description: 'PSA API Token for certificate verification',
          category: 'api'
        }
      });

      clearTimeout(timeoutId);

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Success",
        description: "PSA API token saved successfully"
      });

      setToken('');
      await checkCurrentTokenStatus(); // Refresh status
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Error saving PSA API token:', error);
      
      let errorMessage = "Failed to save PSA API token";
      if (error.message?.includes('Admin role required')) {
        errorMessage = "Admin role required to save PSA API token";
      } else if (error.message?.includes('timeout')) {
        errorMessage = "Request timed out. Please try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewCurrentToken = async () => {
    setLoadingCurrentToken(true);
    try {
      // Use edge function to get decrypted system setting
      const { data, error } = await supabase.functions.invoke('get-decrypted-system-setting', {
        body: { keyName: 'PSA_API_TOKEN' }
      });

      if (error) {
        throw error;
      }

      if (data?.value) {
        setCurrentToken(data.value);
        setShowCurrentToken(true);
        toast({
          title: "Success",
          description: "Current PSA API token retrieved"
        });
      } else {
        toast({
          title: "Info",
          description: "No PSA API token found in database",
          variant: "default"
        });
      }
    } catch (error: any) {
      console.error('Error retrieving current token:', error);
      
      let errorMessage = "Failed to retrieve current token";
      if (error.message?.includes('Admin role required')) {
        errorMessage = "Admin role required to view PSA API token";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoadingCurrentToken(false);
    }
  };

  const handleTestToken = async () => {
    if (!token.trim()) {
      toast({
        title: "Error",
        description: "Please enter a PSA API token to test",
        variant: "destructive"
      });
      return;
    }

    setTestLoading(true);
    setTestResult(null);
    
    try {
      // First save the token temporarily for testing
      const { data: saveData, error: saveError } = await supabase.functions.invoke('set-system-setting', {
        body: {
          keyName: 'PSA_API_TOKEN',
          keyValue: token.trim(),
          description: 'PSA API Token for certificate verification',
          category: 'api'
        }
      });

      if (saveError || saveData?.error) {
        throw new Error(saveData?.error || saveError?.message || 'Failed to save token for testing');
      }

      // Test with a known certificate number (user can change this in settings)
      const testCertNumber = '120317196'; // Use the known test cert number

      const { data, error } = await supabase.functions.invoke('psa-scrape-v2', {
        body: { 
          cert: testCertNumber,
          forceRefresh: true 
        }
      });

      if (error) {
        throw error;
      }

      setTestResult(data);
      
      if (data?.ok) {
        toast({
          title: "Success",
          description: "PSA API token is working correctly!"
        });
      } else {
        toast({
          title: "Warning",
          description: data?.error || "API test returned an error",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error testing PSA API token:', error);
      setTestResult({ 
        ok: false, 
        error: error.message || "Failed to test PSA API token" 
      });
      toast({
        title: "Error",
        description: error.message || "Failed to test PSA API token",
        variant: "destructive"
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">PSA API Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Enter your PSA API token to enable direct certificate verification through the official PSA API.
            This replaces web scraping with reliable API calls.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2">
          <Label>Current Status:</Label>
          <Badge variant={currentStatus.hasToken ? "default" : "secondary"}>
            {currentStatus.hasToken ? `Active (${currentStatus.source})` : "Not configured"}
          </Badge>
          {currentStatus.lastTested && (
            <span className="text-sm text-muted-foreground">
              Last updated: {currentStatus.lastTested.toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="psa-token">PSA API Token</Label>
          <Input
            id="psa-token"
            type="password"
            placeholder="Enter your PSA API token..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading || testLoading}
          />
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={handleSaveToken}
            disabled={loading || testLoading || !token.trim()}
          >
            {loading ? "Saving..." : "Save Token"}
          </Button>
          
          <Button 
            variant="outline"
            onClick={handleTestToken}
            disabled={loading || testLoading || !token.trim()}
          >
            {testLoading ? "Testing..." : "Test Token"}
          </Button>
          
          {currentStatus.hasToken && (
            <Button 
              variant="secondary"
              onClick={handleViewCurrentToken}
              disabled={loadingCurrentToken}
            >
              <Eye className="w-4 h-4 mr-2" />
              {loadingCurrentToken ? "Loading..." : "View Current Token"}
            </Button>
          )}
        </div>

        {showCurrentToken && currentToken && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <Label>Current PSA API Token:</Label>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  setShowCurrentToken(false);
                  setCurrentToken('');
                }}
              >
                <EyeOff className="w-4 h-4 mr-2" />
                Hide
              </Button>
            </div>
            <div className="bg-muted p-3 rounded mt-2 font-mono text-sm break-all">
              {currentToken}
            </div>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(currentToken);
                  toast({
                    title: "Copied",
                    description: "PSA API token copied to clipboard"
                  });
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
          </div>
        )}

        {testResult && (
          <div className="mt-4">
            <Label>Test Result:</Label>
            <pre className="text-xs overflow-auto max-h-64 bg-muted p-3 rounded mt-2">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        )}

        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>How to get a PSA API token:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-4">
            <li>Visit the PSA developer portal</li>
            <li>Register for API access</li>
            <li>Generate your API token</li>
            <li>Enter the token above and click "Save Token"</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}