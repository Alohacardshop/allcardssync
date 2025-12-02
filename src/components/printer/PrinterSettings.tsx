/**
 * Clean Printer Settings Component - Direct TCP Only
 */

import React, { useState, useEffect } from 'react';
import { usePrinter, type PrinterConfig } from '@/hooks/usePrinter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Printer, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  Search,
  Save
} from 'lucide-react';

interface PrinterSettingsProps {
  onSaved?: () => void;
}

export function PrinterSettings({ onSaved }: PrinterSettingsProps) {
  const { 
    config, 
    status, 
    isConnected, 
    isLoading,
    saveConfig, 
    testConnection, 
    discoverPrinters,
    refreshStatus 
  } = usePrinter();

  const [ip, setIp] = useState(config?.ip || '');
  const [port, setPort] = useState(config?.port?.toString() || '9100');
  const [name, setName] = useState(config?.name || '');
  const [discoveredPrinters, setDiscoveredPrinters] = useState<PrinterConfig[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Sync form with config changes
  useEffect(() => {
    if (config) {
      setIp(config.ip);
      setPort(config.port.toString());
      setName(config.name);
    }
  }, [config]);

  const handleSave = async () => {
    if (!ip) {
      return;
    }
    
    const newConfig: PrinterConfig = {
      ip,
      port: parseInt(port) || 9100,
      name: name || `Zebra (${ip})`
    };
    
    await saveConfig(newConfig);
    await testConnection(newConfig.ip, newConfig.port);
    onSaved?.();
  };

  const handleTestConnection = async () => {
    await testConnection(ip, parseInt(port) || 9100);
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      // Try to detect network base from current IP or use default
      const networkBase = ip ? ip.split('.').slice(0, 3).join('.') : '192.168.0';
      const printers = await discoverPrinters(networkBase);
      setDiscoveredPrinters(printers);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSelectDiscovered = (printer: PrinterConfig) => {
    setIp(printer.ip);
    setPort(printer.port.toString());
    setName(printer.name);
  };

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Printer className="h-5 w-5" />
              Printer Status
            </CardTitle>
            {config && (
              <Badge variant={isConnected ? "default" : "destructive"}>
                {isConnected ? (
                  <><Wifi className="h-3 w-3 mr-1" /> Connected</>
                ) : (
                  <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
                )}
              </Badge>
            )}
          </div>
        </CardHeader>
        {config && status && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                {status.ready ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                )}
                <span>Ready: {status.ready ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={status.paused ? 'text-amber-500' : 'text-muted-foreground'}>
                  Paused: {status.paused ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={status.headOpen ? 'text-destructive' : 'text-muted-foreground'}>
                  Head Open: {status.headOpen ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={status.mediaOut ? 'text-destructive' : 'text-muted-foreground'}>
                  Media Out: {status.mediaOut ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="mt-2" 
              onClick={refreshStatus}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Printer Configuration</CardTitle>
          <CardDescription>
            Enter your Zebra printer's IP address and port
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                placeholder="192.168.0.100"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                placeholder="9100"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Printer Name (optional)</Label>
            <Input
              id="name"
              placeholder="Label Printer"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!ip || isLoading}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={handleTestConnection} disabled={!ip || isLoading}>
              <Wifi className="h-4 w-4 mr-2" />
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Printer Discovery */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Discover Printers</CardTitle>
          <CardDescription>
            Scan your network for Zebra printers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            variant="outline" 
            onClick={handleDiscover} 
            disabled={isDiscovering}
            className="w-full"
          >
            <Search className={`h-4 w-4 mr-2 ${isDiscovering ? 'animate-pulse' : ''}`} />
            {isDiscovering ? 'Scanning...' : 'Scan Network'}
          </Button>

          {discoveredPrinters.length > 0 && (
            <div className="space-y-2">
              <Label>Found Printers</Label>
              {discoveredPrinters.map((printer) => (
                <div
                  key={printer.ip}
                  className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSelectDiscovered(printer)}
                >
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4" />
                    <span className="font-medium">{printer.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {printer.ip}:{printer.port}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
