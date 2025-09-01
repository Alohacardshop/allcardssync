import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export function PSAApiSettings() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

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
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key_name: 'PSA_API_TOKEN',
          key_value: token.trim(),
          description: 'PSA API Token for certificate verification',
          category: 'api',
          is_encrypted: true
        }, {
          onConflict: 'key_name'
        });

      if (error) {
        throw error;
      }

      toast({
        title: "Success",
        description: "PSA API token saved successfully"
      });

      setToken('');
    } catch (error: any) {
      console.error('Error saving PSA API token:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save PSA API token",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
      // First save the token temporarily
      await supabase
        .from('system_settings')
        .upsert({
          key_name: 'PSA_API_TOKEN',
          key_value: token.trim(),
          description: 'PSA API Token for certificate verification',
          category: 'api',
          is_encrypted: true
        }, {
          onConflict: 'key_name'
        });

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
        </div>

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