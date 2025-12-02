import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Printer, Wifi, WifiOff, RefreshCw, Check, AlertCircle, Search, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter, type PrinterConfig } from '@/hooks/usePrinter';

export const PrinterSettings: React.FC = () => {
  const { printer, status, isLoading, isConnected, saveConfig, testConnection, refreshStatus, discoverPrinters } = usePrinter();
  
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [editName, setEditName] = useState('');
  const [networkBase, setNetworkBase] = useState('192.168.1');
  const [discoveredPrinters, setDiscoveredPrinters] = useState<PrinterConfig[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0, found: 0 });

  // Sync form state when printer config loads
  useEffect(() => {
    if (printer) {
      setEditIp(printer.ip);
      setEditPort(String(printer.port));
      setEditName(printer.name);
      // Extract network base from existing IP
      const parts = printer.ip.split('.');
      if (parts.length === 4) {
        setNetworkBase(parts.slice(0, 3).join('.'));
      }
    }
  }, [printer]);

  const handleSave = async () => {
    const config: PrinterConfig = {
      ip: editIp,
      port: parseInt(editPort) || 9100,
      name: editName || `Zebra ZD410 (${editIp})`
    };
    
    await saveConfig(config);
    toast.success('Printer settings saved');
    
    // Test connection after save
    const connected = await testConnection(config.ip, config.port);
    if (connected) {
      toast.success('Printer connected successfully');
    } else {
      toast.warning('Printer saved but connection test failed');
    }
  };

  const handleTestConnection = async () => {
    const connected = await testConnection(editIp, parseInt(editPort) || 9100);
    if (connected) {
      toast.success('Connection successful!');
      await refreshStatus();
    } else {
      toast.error('Connection failed. Check IP address and ensure printer is on.');
    }
  };

  const handleDiscover = async (fullScan: boolean = false) => {
    setIsDiscovering(true);
    setDiscoveredPrinters([]);
    setScanProgress({ scanned: 0, total: fullScan ? 254 : 22, found: 0 });
    
    try {
      const printers = await discoverPrinters({
        networkBase,
        fullScan,
        onProgress: (scanned, total, found) => {
          setScanProgress({ scanned, total, found });
        }
      });
      
      setDiscoveredPrinters(printers);
      
      if (printers.length > 0) {
        toast.success(`Found ${printers.length} printer(s)`);
      } else {
        toast.info('No printers found on network');
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDiscovered = (p: PrinterConfig) => {
    setEditIp(p.ip);
    setEditPort(String(p.port));
    setEditName(p.name);
    toast.info(`Selected ${p.name}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="w-5 h-5" />
          Printer Settings
        </CardTitle>
        <CardDescription>
          Configure your Zebra label printer for direct TCP printing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          {isConnected ? (
            <Wifi className="w-5 h-5 text-green-500" />
          ) : (
            <WifiOff className="w-5 h-5 text-muted-foreground" />
          )}
          <div className="flex-1">
            <div className="font-medium">{printer?.name || 'Zebra ZD410'}</div>
            <div className="text-sm text-muted-foreground">
              {printer ? `${printer.ip}:${printer.port}` : 'Not configured'}
            </div>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {/* Printer Status Details */}
        {status && (
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

        {/* Configuration Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder="192.168.1.70"
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
            <Label htmlFor="name">Printer Name</Label>
            <Input
              id="name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Zebra ZD410"
            />
          </div>
        </div>

        {/* Network Discovery */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="networkBase">Network Base (first 3 octets)</Label>
            <Input
              id="networkBase"
              value={networkBase}
              onChange={(e) => setNetworkBase(e.target.value)}
              placeholder="192.168.1"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Your ZD410's IP can be found via Settings → Network on the printer display
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isLoading}>
            Save Settings
          </Button>
          <Button variant="outline" onClick={handleTestConnection} disabled={isLoading || !editIp}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Test Connection
          </Button>
          <Button variant="outline" onClick={() => handleDiscover(false)} disabled={isDiscovering}>
            <Zap className={`w-4 h-4 mr-2`} />
            Quick Scan
          </Button>
          <Button variant="outline" onClick={() => handleDiscover(true)} disabled={isDiscovering}>
            <Search className={`w-4 h-4 mr-2 ${isDiscovering ? 'animate-spin' : ''}`} />
            Full Scan
          </Button>
        </div>

        {/* Scan Progress */}
        {isDiscovering && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Scanning {networkBase}.x...</span>
              <span>{scanProgress.scanned}/{scanProgress.total} ({scanProgress.found} found)</span>
            </div>
            <Progress value={(scanProgress.scanned / scanProgress.total) * 100} />
          </div>
        )}

        {/* Discovered Printers */}
        {discoveredPrinters.length > 0 && (
          <div className="space-y-2">
            <Label>Discovered Printers</Label>
            <div className="space-y-2">
              {discoveredPrinters.map((p) => (
                <button
                  key={p.ip}
                  onClick={() => handleSelectDiscovered(p)}
                  className="w-full p-3 text-left rounded-lg border hover:bg-muted transition-colors"
                >
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{p.ip}:{p.port}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
