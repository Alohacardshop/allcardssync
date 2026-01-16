/**
 * QZ Tray Test Page - Debug/testing interface for QZ Tray printing
 */

import React, { useState } from 'react';
import { useQzTray } from '@/hooks/useQzTray';
import { PrinterSelect } from '@/components/PrinterSelect';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Wifi,
  WifiOff,
  Printer,
  Send,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

const SAMPLE_ZPL = `^XA
^FO50,50^ADN,36,20^FDTest Label from Aloha^FS
^FO50,100^BCN,80,Y,N,N
^FD1234567890^FS
^FO50,200^ADN,24,12^FDPrinted via QZ Tray^FS
^XZ`;

export default function QzTrayTestPage() {
  const {
    isConnected,
    isConnecting,
    connectionError,
    connect,
    disconnect,
    printers,
    zebraPrinters,
    selectedPrinter,
    setSelectedPrinter,
    refreshPrinters,
    isLoadingPrinters,
    printZpl,
    isPrinting,
    printError,
  } = useQzTray();

  const [zplContent, setZplContent] = useState(SAMPLE_ZPL);
  const [showAllPrinters, setShowAllPrinters] = useState(false);

  const handleConnect = async () => {
    try {
      await connect();
      toast.success('Connected to QZ Tray');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.info('Disconnected from QZ Tray');
  };

  const handlePrint = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer');
      return;
    }

    if (!zplContent.trim()) {
      toast.error('Please enter ZPL content');
      return;
    }

    try {
      await printZpl(selectedPrinter, zplContent);
      toast.success(`Label sent to ${selectedPrinter}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Print failed');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto py-8 px-4 max-w-4xl">
        <PageHeader
          title="QZ Tray Test"
          description="Test and debug QZ Tray printing functionality"
          showEcosystem
        />

      {/* Connection Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="h-5 w-5 text-green-500" />
            ) : (
              <WifiOff className="h-5 w-5 text-destructive" />
            )}
            Connection Status
          </CardTitle>
          <CardDescription>
            QZ Tray must be installed and running on this computer
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge
              variant={isConnected ? 'default' : 'destructive'}
              className={isConnected ? 'bg-green-500 hover:bg-green-600' : ''}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>

            {isConnected ? (
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect to QZ Tray'
                )}
              </Button>
            )}
          </div>

          {connectionError && (
            <Alert variant="destructive" className="mt-4">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{connectionError}</AlertDescription>
            </Alert>
          )}

          {!isConnected && !connectionError && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm mb-2">
                <strong>QZ Tray not installed?</strong>
              </p>
              <a
                href="https://qz.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Download className="h-4 w-4" />
                Download QZ Tray
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Printer Selection Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Printer Selection
          </CardTitle>
          <CardDescription>
            Select a printer from the list of available devices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAllPrinters}
                onChange={(e) => setShowAllPrinters(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Show all printers</span>
            </label>
            <span className="text-sm text-muted-foreground">
              ({showAllPrinters ? printers.length : zebraPrinters.length} available)
            </span>
          </div>

          <PrinterSelect
            value={selectedPrinter || ''}
            onChange={setSelectedPrinter}
            printers={printers}
            zebraPrinters={zebraPrinters}
            filterZebra={!showAllPrinters}
            isLoading={isLoadingPrinters}
            onRefresh={refreshPrinters}
            disabled={!isConnected}
            placeholder={
              !isConnected
                ? 'Connect to QZ Tray first'
                : showAllPrinters
                ? 'Select any printer...'
                : 'Select Zebra printer...'
            }
          />

          {selectedPrinter && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Selected: <strong>{selectedPrinter}</strong>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ZPL Content Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>ZPL Content</CardTitle>
          <CardDescription>
            Enter or edit the ZPL code to send to the printer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={zplContent}
            onChange={(e) => setZplContent(e.target.value)}
            placeholder="Enter ZPL code here..."
            className="font-mono h-64 bg-background"
          />

          <div className="flex items-center gap-4">
            <Button
              onClick={() => setZplContent(SAMPLE_ZPL)}
              variant="outline"
              size="sm"
            >
              Reset to Sample
            </Button>
            <Button
              onClick={() => setZplContent('')}
              variant="ghost"
              size="sm"
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Print Action Card */}
      <Card>
        <CardHeader>
          <CardTitle>Print Test Label</CardTitle>
          <CardDescription>
            Send the ZPL content to the selected printer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {printError && (
            <Alert variant="destructive" className="mb-4">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Print Error</AlertTitle>
              <AlertDescription>{printError}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handlePrint}
            disabled={!isConnected || !selectedPrinter || isPrinting}
            size="lg"
            className="w-full"
          >
            {isPrinting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Printing...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Print Test Label
              </>
            )}
          </Button>

          {!isConnected && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Connect to QZ Tray first to enable printing
            </p>
          )}
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
