import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, TestTube, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PSATestResult {
  ok: boolean;
  cert: string;
  timings: {
    total: number;
    tokenRetrieval: number;
    psaCardApi: number;
    psaImageApi: number;
  };
  errors: string[];
  raw: {
    cardData: any;
    imageData: any;
  };
  normalized: {
    certNumber: string;
    grade?: string;
    year?: string;
    brandTitle?: string;
    subject?: string;
    cardNumber?: string;
    varietyPedigree?: string;
    labelType?: string;
    categoryName?: string;
    imageUrls: string[];
    imageUrl?: string;
  };
  summary: {
    tokenFound: boolean;
    cardApiSuccess: boolean;
    imageApiSuccess: boolean;
    totalFields: number;
    imageCount: number;
    hasErrors: boolean;
  };
  error?: string;
}

export const AdminPSATest = () => {
  const [cert, setCert] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PSATestResult | null>(null);
  const [showCardRaw, setShowCardRaw] = useState(false);
  const [showImageRaw, setShowImageRaw] = useState(false);

  const handleSubmit = async () => {
    if (!cert.trim()) {
      toast.error("Please enter a PSA certificate number");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('admin-psa-test', {
        body: { cert: cert.trim() }
      });

      if (error) throw error;

      if (data.ok) {
        setResult(data);
        toast.success(`PSA test completed in ${data.timings.total}ms`);
      } else {
        toast.error(data.error || 'Test failed');
      }
    } catch (error) {
      console.error('PSA test error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to test PSA API');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) {
      handleSubmit();
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Admin PSA API Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label htmlFor="test-cert">PSA Certificate Number</Label>
              <Input
                id="test-cert"
                placeholder="e.g., 118372000"
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={loading}
              />
            </div>
            <Button 
              onClick={handleSubmit}
              disabled={loading || !cert.trim()}
              className="px-8"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Testing...
                </>
              ) : (
                'Test PSA API'
              )}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Test PSA Public API connectivity and data retrieval. Admin access required.
          </p>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm font-medium">Total Time</Label>
                <p className="text-lg font-mono">{result.timings.total}ms</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Fields Found</Label>
                <p className="text-lg">{result.summary.totalFields}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Images Found</Label>
                <p className="text-lg">{result.summary.imageCount}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <div className="flex gap-1 mt-1">
                  <Badge variant={result.summary.tokenFound ? "default" : "destructive"}>
                    Token {result.summary.tokenFound ? 'Found' : 'Missing'}
                  </Badge>
                  <Badge variant={result.summary.cardApiSuccess ? "default" : "secondary"}>
                    API {result.summary.cardApiSuccess ? 'OK' : 'Error'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Performance Timing */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Performance Breakdown</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                <div className="flex justify-between">
                  <span>Token Retrieval:</span>
                  <span className="font-mono">{result.timings.tokenRetrieval}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Card API:</span>
                  <span className="font-mono">{result.timings.psaCardApi}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Image API:</span>
                  <span className="font-mono">{result.timings.psaImageApi}ms</span>
                </div>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 block text-destructive">Errors</Label>
                <div className="space-y-1">
                  {result.errors.map((error, index) => (
                    <p key={index} className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Normalized Data */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Normalized Card Data</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Grade:</span> {result.normalized.grade || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Year:</span> {result.normalized.year || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Brand/Title:</span> {result.normalized.brandTitle || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Subject:</span> {result.normalized.subject || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Card Number:</span> {result.normalized.cardNumber || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Variety:</span> {result.normalized.varietyPedigree || 'N/A'}
                </div>
              </div>
            </div>

            {/* Images */}
            {result.normalized.imageUrls.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 block">Images ({result.normalized.imageUrls.length})</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {result.normalized.imageUrls.slice(0, 4).map((url, index) => (
                    <div key={index} className="relative">
                      <img 
                        src={url} 
                        alt={`PSA Card ${index + 1}`}
                        className="w-full h-24 object-cover rounded border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Data Sections */}
            <div className="space-y-2">
              <Collapsible open={showCardRaw} onOpenChange={setShowCardRaw}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    Raw Card Data
                    {showCardRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="relative">
                    <pre className="text-xs bg-muted p-3 rounded border overflow-auto max-h-60">
                      {JSON.stringify(result.raw.cardData, null, 2)}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(JSON.stringify(result.raw.cardData, null, 2))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={showImageRaw} onOpenChange={setShowImageRaw}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    Raw Image Data  
                    {showImageRaw ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="relative">
                    <pre className="text-xs bg-muted p-3 rounded border overflow-auto max-h-60">
                      {JSON.stringify(result.raw.imageData, null, 2)}
                    </pre>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(JSON.stringify(result.raw.imageData, null, 2))}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};