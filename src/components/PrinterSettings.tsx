import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, Wifi, WifiOff, RefreshCw, Check, AlertCircle, MapPin, Info, Server, Download, FileText, Scissors, Target, MoveDown, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter } from '@/hooks/usePrinter';
import { zebraService } from '@/lib/printer/zebraService';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQzTray } from '@/hooks/useQzTray';
import { PrinterSelect } from '@/components/PrinterSelect';

export const PrinterSettings: React.FC = () => {
  const { printer, status, isLoading, saveConfig, testConnection, refreshStatus } = usePrinter();
  const { selectedLocation, availableLocations } = useStore();
  const { user } = useAuth();
  const { 
    isConnected: qzConnected, 
    isConnecting, 
    printers, 
    zebraPrinters,
    isLoadingPrinters,
    connect, 
    refreshPrinters,
    selectedPrinter,
    setSelectedPrinter
  } = useQzTray();
  
  const currentLocationName = availableLocations.find(l => l.gid === selectedLocation)?.name || 'Unknown Location';
  
  const [isTesting, setIsTesting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Sync selected printer from saved config
  useEffect(() => {
    if (printer?.name && !selectedPrinter) {
      setSelectedPrinter(printer.name);
    }
  }, [printer, selectedPrinter, setSelectedPrinter]);

  const handleSave = async () => {
    if (!selectedPrinter) {
      toast.error('Please select a printer');
      return;
    }
    
    await saveConfig({ name: selectedPrinter });
    toast.success('Printer settings saved');
  };

  const handleTestConnection = async () => {
    if (!qzConnected) {
      toast.error('QZ Tray not connected. Click Connect first.');
      return;
    }
    
    setIsTesting(true);
    const connected = await testConnection();
    setIsTesting(false);
    
    if (connected) {
      toast.success('Connection successful!');
      await refreshStatus();
    } else {
      toast.error('Connection test failed.');
    }
  };

  const handleTestPrint = async () => {
    if (!qzConnected) {
      toast.error('QZ Tray not connected. Click Connect first.');
      return;
    }
    
    if (!selectedPrinter) {
      toast.error('Select a printer first');
      return;
    }

    setIsPrinting(true);
    
    // Simple test label ZPL - 2" x 1" label
    const testZpl = `^XA
^LT-10
^CF0,30
^FO50,20^FDTEST PRINT^FS
^CF0,20
^FO50,60^FD${selectedPrinter}^FS
^FO50,110^FD${new Date().toLocaleString()}^FS
^BY2,2,50
^FO50,140^BC^FDTEST123^FS
^XZ`;

    const result = await zebraService.print(testZpl, selectedPrinter);
    setIsPrinting(false);

    if (result.success) {
      toast.success('Test label sent to printer!');
    } else {
      toast.error(`Print failed: ${result.error || 'Unknown error'}`);
    }
  };

  const sendCommand = async (command: string, description: string) => {
    if (!qzConnected) {
      toast.error('QZ Tray not connected');
      return;
    }
    if (!selectedPrinter) {
      toast.error('Select a printer first');
      return;
    }

    console.log(`[Printer] Sending ${description} command:`, command);
    const result = await zebraService.print(command, selectedPrinter);
    console.log(`[Printer] ${description} result:`, result);
    
    if (result.success) {
      toast.success(`${description} command sent`);
    } else {
      toast.error(`Failed: ${result.error || 'Unknown error'}`);
    }
  };

  // Feed: Print minimal blank label to advance (works in all modes)
  const handleFeedLabel = () => sendCommand('^XA^FO0,0^FD ^FS^XZ', 'Feed');
  
  // Calibrate: Media and ribbon sensor calibration
  const handleCalibrate = () => sendCommand('~JC', 'Calibrate');
  
  // Cut: Set cutter mode and print blank label (auto-cuts)
  const handleCut = () => sendCommand('^XA^MMC^FO0,0^FD ^FS^XZ', 'Cut');
  
  // Cancel all queued jobs
  const handleCancelJobs = () => sendCommand('~JA', 'Cancel jobs');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Printer Settings
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Settings for <span className="font-medium">{currentLocationName}</span>
          {user?.email && <span className="text-xs">• {user.email}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* QZ Tray Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border">
          <Server className={`w-5 h-5 ${qzConnected ? 'text-green-500' : 'text-destructive'}`} />
          <div className="flex-1">
            <div className="font-medium">QZ Tray</div>
            <div className="text-sm text-muted-foreground">
              {isConnecting ? 'Connecting...' : qzConnected 
                ? 'Connected to local print service' 
                : 'Not connected'}
            </div>
          </div>
          <Badge variant={qzConnected ? 'default' : 'destructive'}>
            {isConnecting ? 'Connecting' : qzConnected ? 'Online' : 'Offline'}
          </Badge>
          {!qzConnected && (
            <Button variant="default" size="sm" onClick={connect} disabled={isConnecting}>
              Connect
            </Button>
          )}
        </div>

        {/* QZ Tray Not Connected Warning */}
        {!isConnecting && !qzConnected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>QZ Tray Required</strong>
              <p className="mt-2 text-sm">
                QZ Tray must be installed and running on this computer to print labels.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Download from:</span>
                  <code className="px-2 py-1 bg-muted rounded text-xs select-all cursor-text">
                    https://qz.io/download/
                  </code>
                </div>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Copy the URL above and open it in a new browser tab</li>
                  <li>Download and install QZ Tray for your operating system</li>
                  <li>Run QZ Tray (it runs in your system tray)</li>
                  <li>Click "Connect" above and approve the trust dialog</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Printer Selection */}
        {qzConnected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-muted-foreground" />
              <div className="flex-1">
                <Label>Select Printer</Label>
                <PrinterSelect
                  value={selectedPrinter || ''}
                  onChange={setSelectedPrinter}
                  printers={printers}
                  zebraPrinters={zebraPrinters}
                  isLoading={isLoadingPrinters}
                  onRefresh={refreshPrinters}
                  filterZebra={false}
                  showRefreshButton
                  placeholder="Select a printer..."
                />
              </div>
            </div>
            {zebraPrinters.length > 0 && (
              <p className="text-xs text-muted-foreground ml-8">
                Zebra printers detected: {zebraPrinters.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Printer Status Details */}
        {status && printer?.ip && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              {status.ready ? <Check className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
              <span>Ready: {status.ready ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              {!status.paused ? <Check className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
              <span>Paused: {status.paused ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center gap-2">
              {!status.headOpen ? <Check className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
              <span>Head: {status.headOpen ? 'Open' : 'Closed'}</span>
            </div>
            <div className="flex items-center gap-2">
              {!status.mediaOut ? <Check className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
              <span>Media: {status.mediaOut ? 'Out' : 'OK'}</span>
            </div>
          </div>
        )}

        {/* How QZ Tray works */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>How QZ Tray works:</strong>
            <ul className="mt-2 ml-4 list-disc text-sm space-y-1">
              <li>QZ Tray runs on your computer and connects to local/network printers</li>
              <li>Both USB and network printers are supported</li>
              <li>Select your printer from the dropdown above</li>
              <li>Zebra printers are auto-detected and highlighted</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Actions */}
        {qzConnected && (
          <div className="flex flex-wrap gap-2">
            <Button 
              onClick={handleSave} 
              disabled={isLoading || isTesting || !selectedPrinter}
            >
              Save Settings
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTestConnection} 
              disabled={isLoading || isTesting || !selectedPrinter}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isTesting ? 'animate-spin' : ''}`} />
              Test Connection
            </Button>
            {selectedPrinter && (
              <>
                <Button 
                  variant="secondary" 
                  onClick={handleTestPrint} 
                  disabled={isLoading || isPrinting}
                >
                  <FileText className={`w-4 h-4 mr-2 ${isPrinting ? 'animate-pulse' : ''}`} />
                  {isPrinting ? 'Printing...' : 'Test Print'}
                </Button>
                <Button variant="ghost" onClick={refreshStatus} disabled={isLoading}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Status
                </Button>
              </>
            )}
          </div>
        )}

        {/* Printer Utilities */}
        {selectedPrinter && qzConnected && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Printer Utilities</Label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleFeedLabel}>
                <MoveDown className="w-4 h-4 mr-1" />
                Feed Label
              </Button>
              <Button variant="outline" size="sm" onClick={handleCalibrate}>
                <Target className="w-4 h-4 mr-1" />
                Calibrate
              </Button>
              <Button variant="outline" size="sm" onClick={handleCut}>
                <Scissors className="w-4 h-4 mr-1" />
                Cut
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancelJobs}>
                <XCircle className="w-4 h-4 mr-1" />
                Cancel Jobs
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Feed advances one label. Calibrate auto-detects label size. Cut triggers the cutter (if equipped).
            </p>
          </div>
        )}

        {/* Info note */}
        <p className="text-xs text-muted-foreground">
          QZ Tray connects to printers installed on this computer. Both USB and network printers are supported.
        </p>
      </CardContent>
    </Card>
  );
};
