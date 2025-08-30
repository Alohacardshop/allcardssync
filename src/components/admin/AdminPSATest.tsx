import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { Copy, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, Image, Settings, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

interface PSATestResult {
  success: boolean;
  cert?: string;
  card_data?: any;
  image_data?: any;
  summary?: {
    grade?: string;
    year?: string;
    subject?: string;
    brand_set?: string;
    population_higher?: number;
    population_same?: number;
    source?: string;
  };
  images?: string[];
  timing?: {
    card_api_ms?: number;
    image_api_ms?: number;
    total_ms?: number;
  };
  errors?: string[];
}

export function AdminPSATest() {
  const [cert, setCert] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PSATestResult | null>(null);
  const [showCardData, setShowCardData] = useState(false);
  const [showImageData, setShowImageData] = useState(false);
  const [useOfficialAPI, setUseOfficialAPI] = useState(false);
  const [checkingAPI, setCheckingAPI] = useState(false);
  const { toast } = useToast();

  const checkFirecrawlAPI = async () => {
    setCheckingAPI(true);
    try {
      console.log("Checking Firecrawl API connection...");
      const { data, error } = await supabase.functions.invoke('psa-scrape', {
        body: { cert: "test", mode: "ping" }
      });

      if (error) throw error;

      if (data.ok) {
        toast({
          title: "API Connected ✓",
          description: "Firecrawl API is properly configured and accessible",
        });
      } else {
        toast({
          title: "API Issue",
          description: data.error || "Firecrawl API returned an error",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("Firecrawl API check error:", error);
      toast({
        title: "API Check Failed",
        description: error.message || "Failed to check Firecrawl API",
        variant: "destructive"
      });
    } finally {
      setCheckingAPI(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cert.trim()) return;

    setLoading(true);
    setResult(null);

    const startTime = Date.now();
    const apiType = useOfficialAPI ? "Official PSA API" : "Firecrawl Scraper";

    try {
      console.log(`Testing PSA with ${apiType}...`);
      const functionName = useOfficialAPI ? 'admin-psa-test' : 'psa-scrape';
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { cert: cert.trim() }
      });

      const totalTime = Date.now() - startTime;

      if (error) throw error;
      
      console.log("PSA scrape response:", data);
      
      // Transform the response to match our interface
      let transformedResult: PSATestResult;
      
      if (useOfficialAPI) {
        // Handle Official PSA API response
        const results = data.results;
        transformedResult = {
          success: true,
          cert: results.cert,
          card_data: results.api_responses?.card_data,
          image_data: results.api_responses?.image_data,
          summary: results.normalized_data?.card ? {
            grade: results.normalized_data.card.grade?.toString(),
            year: results.normalized_data.card.year?.toString(),
            subject: results.normalized_data.card.subject,
            brand_set: results.normalized_data.card.brandTitle,
            population_higher: results.normalized_data.card.popHigher,
            population_same: results.normalized_data.card.totalPopulation,
            source: 'PSA Public API'
          } : undefined,
          images: results.normalized_data?.images?.map((img: any) => img.url),
          timing: results.timing,
          errors: results.errors?.length > 0 ? results.errors : undefined
        };
      } else {
        // Handle Firecrawl Scraper response
        transformedResult = {
          success: data.ok || false,
          cert: data.cert || cert.trim(),
          card_data: data, // The entire response is the card data
          summary: data.ok ? {
            grade: data.gradeDisplay || data.grade,
            year: data.year,
            subject: data.subject || data.cardName,
            brand_set: data.brandTitle || data.set,
            source: data.source === 'firecrawl_structured' ? 'Firecrawl Structured' : 
                   data.source === 'firecrawl_html' ? 'Firecrawl HTML' : 'Firecrawl'
          } : undefined,
          images: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
          timing: {
            total_ms: totalTime
          },
          errors: !data.ok ? [data.error || "Unknown error"] : undefined
        };
      }
      
      setResult(transformedResult);

      if (transformedResult.success) {
        const sourceType = useOfficialAPI ? 'PSA Public API' : 
          (data.source === 'firecrawl_structured' ? 'Firecrawl structured extraction' : 'Firecrawl HTML parsing');
        toast({
          title: "Success!",
          description: `PSA data extracted successfully using ${sourceType}`,
        });
      }
    } catch (error: any) {
      console.error("PSA test error:", error);
      toast({
        title: "Test Failed",
        description: error.message || `Failed to test ${apiType}`,
        variant: "destructive"
      });
      setResult({
        success: false,
        errors: [error.message || `Failed to test ${apiType}`]
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${label} copied to clipboard`
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            PSA API Test
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={checkFirecrawlAPI}
                disabled={checkingAPI}
              >
                {checkingAPI ? <LoadingSpinner size="sm" text="" /> : <Settings className="h-4 w-4 mr-2" />}
                Check Firecrawl API
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* API Source Toggle */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center space-x-3">
              <Zap className="h-4 w-4" />
              <Label htmlFor="api-toggle" className="text-sm font-medium">
                {useOfficialAPI ? "Official PSA API" : "Firecrawl Scraper"}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Label htmlFor="api-toggle" className="text-xs text-muted-foreground">
                Scraper
              </Label>
              <Switch
                id="api-toggle"
                checked={useOfficialAPI}
                onCheckedChange={setUseOfficialAPI}
              />
              <Label htmlFor="api-toggle" className="text-xs text-muted-foreground">
                Official
              </Label>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cert">PSA Certificate Number</Label>
              <div className="flex gap-2">
                <Input
                  id="cert"
                  value={cert}
                  onChange={(e) => setCert(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter PSA certificate number (e.g., 118372000)"
                  disabled={loading}
                />
                <Button type="submit" disabled={loading || !cert.trim()}>
                  {loading ? <LoadingSpinner size="sm" text="" /> : "Test"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="space-y-4">
          {/* Result Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                Test Result
                {result.cert && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(result.cert!, "Certificate")}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.success && result.summary && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.summary.grade && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Grade</Label>
                      <div className="font-medium">{result.summary.grade}</div>
                    </div>
                  )}
                  {result.summary.year && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Year</Label>
                      <div className="font-medium">{result.summary.year}</div>
                    </div>
                  )}
                  {result.summary.subject && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Subject</Label>
                      <div className="font-medium">{result.summary.subject}</div>
                    </div>
                  )}
                  {result.summary.brand_set && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Brand/Set</Label>
                      <div className="font-medium">{result.summary.brand_set}</div>
                    </div>
                  )}
                  {result.summary.population_same !== undefined && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Population (Same Grade)</Label>
                      <div className="font-medium">{result.summary.population_same.toLocaleString()}</div>
                    </div>
                  )}
                  {result.summary.population_higher !== undefined && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Population (Higher)</Label>
                      <div className="font-medium">{result.summary.population_higher.toLocaleString()}</div>
                    </div>
                  )}
                  {result.summary.source && (
                    <div className="sm:col-span-2">
                      <Label className="text-sm text-muted-foreground">Source</Label>
                      <Badge variant="outline">{result.summary.source}</Badge>
                    </div>
                  )}
                </div>
              )}

              {/* Images */}
              {result.images && result.images.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Image className="h-4 w-4" />
                    Images ({result.images.length})
                  </Label>
                  <div className="flex gap-2 overflow-x-auto">
                    {result.images.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                         alt={`PSA Certificate ${index + 1}`}
                        className="h-24 w-auto rounded border"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Timing */}
              {result.timing && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Performance
                  </Label>
                  <div className="flex gap-4 text-sm">
                    {result.timing.card_api_ms && (
                      <Badge variant="secondary">
                        Card API: {result.timing.card_api_ms}ms
                      </Badge>
                    )}
                    {result.timing.image_api_ms && (
                      <Badge variant="secondary">
                        Image API: {result.timing.image_api_ms}ms
                      </Badge>
                    )}
                    {result.timing.total_ms && (
                      <Badge variant="outline">
                        Total: {result.timing.total_ms}ms
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors && result.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      {result.errors.map((error, index) => (
                        <div key={index}>{error}</div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Raw Data */}
          {(result.card_data || result.image_data) && (
            <Card>
              <CardHeader>
                <CardTitle>Raw API Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {result.card_data && (
                  <Collapsible open={showCardData} onOpenChange={setShowCardData}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        Card Data JSON
                        {showCardData ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 z-10"
                          onClick={() => copyToClipboard(JSON.stringify(result.card_data, null, 2), "Card Data")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                          {JSON.stringify(result.card_data, null, 2)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {result.image_data && (
                  <Collapsible open={showImageData} onOpenChange={setShowImageData}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        Image Data JSON
                        {showImageData ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2">
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 z-10"
                          onClick={() => copyToClipboard(JSON.stringify(result.image_data, null, 2), "Image Data")}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <pre className="bg-muted p-4 rounded-md text-xs overflow-auto max-h-96">
                          {JSON.stringify(result.image_data, null, 2)}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}