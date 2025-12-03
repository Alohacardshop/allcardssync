import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, Wifi, WifiOff, RefreshCw, Check, AlertCircle, MapPin, Info, Server, Download, FileText, Scissors, Target, MoveDown, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter, type PrinterConfig } from '@/hooks/usePrinter';
import { zebraService } from '@/lib/printer/zebraService';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { checkBridgeStatus, type BridgeStatus } from '@/lib/printer/zebraService';

export const PrinterSettings: React.FC = () => {
  const { printer, status, isLoading, isConnected, saveConfig, testConnection, refreshStatus } = usePrinter();
  const { selectedLocation, availableLocations } = useStore();
  const { user } = useAuth();
  
  const currentLocationName = availableLocations.find(l => l.gid === selectedLocation)?.name || 'Unknown Location';
  
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [editName, setEditName] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [isCheckingBridge, setIsCheckingBridge] = useState(true);

  // Check bridge status on mount
  useEffect(() => {
    checkBridge();
  }, []);

  const checkBridge = async () => {
    setIsCheckingBridge(true);
    const status = await checkBridgeStatus();
    setBridgeStatus(status);
    setIsCheckingBridge(false);
  };

  // Sync form state when printer config loads
  useEffect(() => {
    if (printer) {
      setEditIp(printer.ip);
      setEditPort(String(printer.port));
      setEditName(printer.name);
    }
  }, [printer]);

  const handleSave = async () => {
    if (!editIp.trim()) {
      toast.error('Please enter a printer IP address');
      return;
    }
    
    const config: PrinterConfig = {
      ip: editIp.trim(),
      port: parseInt(editPort) || 9100,
      name: editName.trim() || `Zebra Printer (${editIp.trim()})`
    };
    
    await saveConfig(config);
    toast.success('Printer settings saved');
    
    // Test connection after save
    setIsTesting(true);
    const connected = await testConnection(config.ip, config.port);
    setIsTesting(false);
    
    if (connected) {
      toast.success('Printer connected successfully');
    } else {
      toast.warning('Printer saved but connection test failed. Check the IP is correct and printer is on.');
    }
  };

  const handleTestConnection = async () => {
    if (!bridgeStatus?.connected) {
      toast.error('Local bridge not running. Start the bridge first.');
      return;
    }
    
    if (!editIp.trim()) {
      toast.error('Please enter an IP address first');
      return;
    }
    
    setIsTesting(true);
    const connected = await testConnection(editIp.trim(), parseInt(editPort) || 9100);
    setIsTesting(false);
    
    if (connected) {
      toast.success('Connection successful!');
      await refreshStatus();
    } else {
      toast.error('Connection failed. Verify IP address and ensure printer is powered on.');
    }
  };

  const handleTestPrint = async () => {
    if (!bridgeStatus?.connected) {
      toast.error('Local bridge not running. Start the bridge first.');
      return;
    }
    
    if (!printer?.ip) {
      toast.error('Save printer settings first');
      return;
    }

    setIsPrinting(true);
    
    // Simple test label ZPL - 2" x 1" label
    const testZpl = `^XA
^CF0,30
^FO50,20^FDTEST PRINT^FS
^CF0,20
^FO50,60^FD${printer.name || 'Zebra Printer'}^FS
^FO50,85^FD${printer.ip}:${printer.port}^FS
^FO50,110^FD${new Date().toLocaleString()}^FS
^BY2,2,50
^FO50,140^BC^FDTEST123^FS
^XZ`;

    const result = await zebraService.print(testZpl, printer.ip, printer.port);
    setIsPrinting(false);

    if (result.success) {
      toast.success('Test label sent to printer!');
    } else {
      toast.error(`Print failed: ${result.error || 'Unknown error'}`);
    }
  };

  const sendCommand = async (command: string, description: string) => {
    if (!bridgeStatus?.connected) {
      toast.error('Local bridge not running');
      return;
    }
    if (!printer?.ip) {
      toast.error('Save printer settings first');
      return;
    }

    console.log(`[Printer] Sending ${description} command:`, command);
    const result = await zebraService.print(command, printer.ip, printer.port);
    console.log(`[Printer] ${description} result:`, result);
    
    if (result.success) {
      toast.success(`${description} command sent`);
    } else {
      toast.error(`Failed: ${result.error || 'Unknown error'}`);
    }
  };

  // Feed: Use form feed control command
  const handleFeedLabel = () => sendCommand('~JF', 'Feed');
  
  // Calibrate: Media and ribbon sensor calibration
  const handleCalibrate = () => sendCommand('~JC', 'Calibrate');
  
  // Cut: Send cut command (requires cutter module)
  // ^MMC = Cutter mode, ^CN1 = Cut now
  const handleCut = () => sendCommand('^XA^MMC^CN1^XZ', 'Cut');
  
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
        {/* Bridge Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted border">
          <Server className={`w-5 h-5 ${bridgeStatus?.connected ? 'text-green-500' : 'text-destructive'}`} />
          <div className="flex-1">
            <div className="font-medium">Local Print Bridge</div>
            <div className="text-sm text-muted-foreground">
              {isCheckingBridge ? 'Checking...' : bridgeStatus?.connected 
                ? `Running on localhost:17777 (v${bridgeStatus.version})` 
                : 'Not running'}
            </div>
          </div>
          <Badge variant={bridgeStatus?.connected ? 'default' : 'destructive'}>
            {isCheckingBridge ? 'Checking' : bridgeStatus?.connected ? 'Online' : 'Offline'}
          </Badge>
          <Button variant="ghost" size="sm" onClick={checkBridge} disabled={isCheckingBridge}>
            <RefreshCw className={`w-4 h-4 ${isCheckingBridge ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Bridge Not Running Warning */}
        {!isCheckingBridge && !bridgeStatus?.connected && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Local Print Bridge Required</strong>
              <p className="mt-2 text-sm">
                The local print bridge must be running on this computer to print labels.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <a 
                  href="https://drive.google.com/uc?export=download&id=1oH3cfm7oTiEwkUTbCbXW-MtofBPBSL_Z" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 w-fit"
                >
                  <Download className="w-4 h-4" />
                  Download ZebraPrintBridge.exe
                </a>
                <p className="text-xs text-muted-foreground">
                  Download and run the bridge on your computer. Keep it running while printing.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Printer Connection Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          {isConnected ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-muted-foreground" />
          )}
          <div className="flex-1">
            <div className="font-medium">{printer?.name || 'No Printer Configured'}</div>
            <div className="text-sm text-muted-foreground">
              {printer?.ip ? `${printer.ip}:${printer.port}` : 'Enter printer IP below'}
            </div>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

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

        {/* How to find printer IP */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>How to find your printer's IP address:</strong>
            <ul className="mt-2 ml-4 list-disc text-sm space-y-1">
              <li><strong>Zebra ZD410/ZD420:</strong> Settings → Network → Wired/Wireless → IP Address</li>
              <li><strong>Zebra ZT230/ZT410:</strong> Press Menu → Network → IP Address</li>
              <li><strong>Print config label:</strong> Hold feed button for 2 seconds, IP is on the label</li>
              <li><strong>Router admin:</strong> Check connected devices in your router's admin panel</li>
            </ul>
          </AlertDescription>
        </Alert>

        {/* Configuration Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="ip">IP Address *</Label>
              <Input
                id="ip"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder="e.g., 192.168.1.70"
              />
            </div>
            <div>
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                value={editPort}
                onChange={(e) => setEditPort(e.target.value)}
                placeholder="9100"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="name">Printer Name (optional)</Label>
            <Input
              id="name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g., Label Printer - Front Counter"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button 
            onClick={handleSave} 
            disabled={isLoading || isTesting || !editIp.trim() || !bridgeStatus?.connected}
          >
            Save Settings
          </Button>
          <Button 
            variant="outline" 
            onClick={handleTestConnection} 
            disabled={isLoading || isTesting || !editIp.trim() || !bridgeStatus?.connected}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isTesting ? 'animate-spin' : ''}`} />
            Test Connection
          </Button>
          {printer?.ip && bridgeStatus?.connected && (
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

        {/* Printer Utilities */}
        {printer?.ip && bridgeStatus?.connected && (
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
          Printing uses the local bridge running on this computer. The printer must be on the same network.
        </p>
      </CardContent>
    </Card>
  );
};
