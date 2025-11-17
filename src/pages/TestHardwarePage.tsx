import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Scan, 
  Printer, 
  Wifi, 
  Database, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  HelpCircle,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PrintNodeSettings } from "@/components/PrintNodeSettings";
import { CutterSettings, CutterConfig } from "@/components/CutterSettings";
import { DefaultPrinterSelector } from "@/components/DefaultPrinterSelector";
import { PrintNodeProvider } from "@/contexts/PrintNodeContext";
import { logger } from '@/lib/logger';
import TemplateEditor from "@/components/admin/TemplateEditor";

interface TestResult {
  status: 'idle' | 'running' | 'success' | 'error';
  message?: string;
  details?: string;
  responseTime?: number;
}

export default function TestHardwarePage() {
  const { toast } = useToast();
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [networkTest, setNetworkTest] = useState<TestResult>({ status: 'idle' });
  const [dbTest, setDbTest] = useState<TestResult>({ status: 'idle' });
  const [cutterConfig, setCutterConfig] = useState<CutterConfig>({
    cutAfter: true,
    cutTiming: 'after-each',
    cutInterval: 1,
    hasCutter: true
  });
  useEffect(() => {
    // Load saved cutter config on mount
    try {
      const saved = localStorage.getItem('zebra-cutter-config');
      if (saved) {
        const config = JSON.parse(saved);
        setCutterConfig(config);
      }
    } catch (error) {
      logger.warn('Failed to load cutter config', { error }, 'test-hardware');
    }
  }, []);

  useEffect(() => {
    // Save cutter config when it changes
    try {
      localStorage.setItem('zebra-cutter-config', JSON.stringify(cutterConfig));
    } catch (error) {
      logger.warn('Failed to save cutter config', { error }, 'test-hardware');
    }
  }, [cutterConfig]);
  
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const handleBarcodeTest = () => {
    if (barcodeInput.trim()) {
      setScannedBarcode(barcodeInput.trim());
      setBarcodeInput('');
      toast({
        title: "Barcode Scanned",
        description: `Successfully read: ${barcodeInput.trim()}`
      });
    }
  };


  const handleNetworkTest = async () => {
    setNetworkTest({ status: 'running' });
    const startTime = Date.now();
    
    try {
      // Test multiple endpoints
      const endpoints = [
        'https://api.shopify.com',
        'https://httpbin.org/status/200',
        'https://api.pokemontcg.io/v2/cards?page=1&pageSize=1'
      ];
      
      const results = await Promise.allSettled(
        endpoints.map(url => fetch(url, { method: 'HEAD' }))
      );
      
      const responseTime = Date.now() - startTime;
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      if (successful === endpoints.length) {
        setNetworkTest({
          status: 'success',
          message: 'Network connectivity excellent',
          details: `All ${endpoints.length} endpoints reachable`,
          responseTime
        });
      } else if (successful > 0) {
        setNetworkTest({
          status: 'error',
          message: 'Partial network connectivity',
          details: `${successful}/${endpoints.length} endpoints reachable`
        });
      } else {
        setNetworkTest({
          status: 'error',
          message: 'Network connectivity failed',
          details: 'No endpoints reachable'
        });
      }
    } catch (error) {
      setNetworkTest({
        status: 'error',
        message: 'Network test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handleDatabaseTest = async () => {
    setDbTest({ status: 'running' });
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase
        .from('intake_items')
        .select('id')
        .limit(1);
      
      const responseTime = Date.now() - startTime;
      
      if (error) {
        setDbTest({
          status: 'error',
          message: 'Database connection failed',
          details: error.message
        });
      } else {
        setDbTest({
          status: 'success',
          message: 'Database connection successful',
          details: 'Query executed successfully',
          responseTime
        });
      }
    } catch (error) {
      setDbTest({
        status: 'error',
        message: 'Database test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const runAllTests = async () => {
    await Promise.all([
      handleNetworkTest(),
      handleDatabaseTest()
    ]);
    
    toast({
      title: "Hardware Tests Complete",
      description: "Check results below for any issues"
    });
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running': return <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'running': return <Badge variant="secondary">Testing...</Badge>;
      case 'success': return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Pass</Badge>;
      case 'error': return <Badge variant="destructive">Fail</Badge>;
      default: return <Badge variant="outline">Not Tested</Badge>;
    }
  };

  return (
    <PrintNodeProvider>
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold">Hardware Testing</h1>
                <Badge variant="outline">Diagnostics</Badge>
              </div>
            </div>
          </div>
        </header>

      <main className="container mx-auto px-4 py-8">
        {/* PrintNode Setup Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Printer Setup
            </CardTitle>
            <CardDescription>
              Configure PrintNode for reliable cloud-based printing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Default Printer Selection */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Default Printer</h3>
                <DefaultPrinterSelector />
              </div>

              {/* PrintNode Configuration */}
              <div>
                <h3 className="text-lg font-semibold mb-4">PrintNode Configuration</h3>
                <PrintNodeSettings />
              </div>

              {/* Cutter Settings */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Label Cutting</h3>
                <CutterSettings 
                  config={cutterConfig}
                  onChange={setCutterConfig}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Barcode Scanner Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Scan className="h-5 w-5" />
                Barcode Scanner Test
              </CardTitle>
              <CardDescription>Test barcode scanning functionality</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Scan or type a barcode:</label>
                <div className="flex gap-2">
                  <Input
                    ref={barcodeInputRef}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Point scanner here or type manually"
                    onKeyDown={(e) => e.key === 'Enter' && handleBarcodeTest()}
                  />
                  <Button onClick={handleBarcodeTest} disabled={!barcodeInput.trim()}>
                    Test
                  </Button>
                </div>
              </div>
              
              {scannedBarcode && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Last Scanned:</strong> {scannedBarcode}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Troubleshooting:</strong></p>
                <p>• Ensure scanner is in HID keyboard mode</p>
                <p>• Check USB connection</p>
                <p>• Try different barcode formats (UPC, Code128, etc.)</p>
                <p>• Verify scanner reads to text fields properly</p>
              </div>
            </CardContent>
          </Card>


          {/* Network Connectivity Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Network Connectivity Test
                {getStatusBadge(networkTest.status)}
              </CardTitle>
              <CardDescription>Test external API connectivity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleNetworkTest} 
                disabled={networkTest.status === 'running'}
                className="w-full"
              >
                {getStatusIcon(networkTest.status)}
                <span className="ml-2">
                  {networkTest.status === 'running' ? 'Testing...' : 'Test Network'}
                </span>
              </Button>
              
              {networkTest.message && (
                <Alert className={networkTest.status === 'error' ? 'border-red-200' : 'border-green-200'}>
                  {getStatusIcon(networkTest.status)}
                  <AlertDescription>
                    <strong>{networkTest.message}</strong>
                    {networkTest.details && <div className="mt-1 text-sm">{networkTest.details}</div>}
                    {networkTest.responseTime && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Response time: {networkTest.responseTime}ms
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Troubleshooting:</strong></p>
                <p>• Check internet connection</p>
                <p>• Verify firewall settings</p>
                <p>• Try different DNS servers (8.8.8.8, 1.1.1.1)</p>
                <p>• Check proxy settings if applicable</p>
                <p>• Ensure no VPN blocking connections</p>
              </div>
            </CardContent>
          </Card>

          {/* Database Connection Test */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Connection Test
                {getStatusBadge(dbTest.status)}
              </CardTitle>
              <CardDescription>Test Supabase database connectivity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleDatabaseTest} 
                disabled={dbTest.status === 'running'}
                className="w-full"
              >
                {getStatusIcon(dbTest.status)}
                <span className="ml-2">
                  {dbTest.status === 'running' ? 'Testing...' : 'Test Database'}
                </span>
              </Button>
              
              {dbTest.message && (
                <Alert className={dbTest.status === 'error' ? 'border-red-200' : 'border-green-200'}>
                  {getStatusIcon(dbTest.status)}
                  <AlertDescription>
                    <strong>{dbTest.message}</strong>
                    {dbTest.details && <div className="mt-1 text-sm">{dbTest.details}</div>}
                    {dbTest.responseTime && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Response time: {dbTest.responseTime}ms
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Troubleshooting:</strong></p>
                <p>• Check Supabase project URL and API key</p>
                <p>• Verify user authentication status</p>
                <p>• Check Row Level Security policies</p>
                <p>• Ensure database tables exist</p>
                <p>• Try refreshing authentication token</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Run All Tests */}
        <div className="mt-8 text-center">
          <Button 
            onClick={runAllTests}
            size="lg"
            className="min-w-48"
          >
            <Zap className="h-4 w-4 mr-2" />
            Run All Tests
          </Button>
        </div>
      </main>
    </div>
    </PrintNodeProvider>
  );
}