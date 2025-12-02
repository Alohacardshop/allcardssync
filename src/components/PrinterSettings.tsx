import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Printer, Wifi, WifiOff, RefreshCw, Check, AlertCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter, type PrinterConfig } from '@/hooks/usePrinter';

export const PrinterSettings: React.FC = () => {
  const { printer, status, isLoading, isConnected, saveConfig, testConnection, refreshStatus, discoverPrinters } = usePrinter();
  
  const [editIp, setEditIp] = useState(printer?.ip || '');
  const [editPort, setEditPort] = useState(String(printer?.port || 9100));
  const [editName, setEditName] = useState(printer?.name || '');
  const [discoveredPrinters, setDiscoveredPrinters] = useState<PrinterConfig[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const handleSave = async () => {
    const config: PrinterConfig = {
      ip: editIp,
      port: parseInt(editPort) || 9100,
      name: editName || `Zebra (${editIp})`
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

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      // Extract network base from current IP
      const parts = editIp.split('.');
      const networkBase = parts.slice(0, 3).join('.');
      
      const printers = await discoverPrinters(networkBase);
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
            <div className="font-medium">{printer.name}</div>
            <div className="text-sm text-muted-foreground">{printer.ip}:{printer.port}</div>
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

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isLoading}>
            Save Settings
          </Button>
          <Button variant="outline" onClick={handleTestConnection} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Test Connection
          </Button>
          <Button variant="outline" onClick={handleDiscover} disabled={isDiscovering}>
            <Search className={`w-4 h-4 mr-2 ${isDiscovering ? 'animate-spin' : ''}`} />
            Discover
          </Button>
        </div>

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
