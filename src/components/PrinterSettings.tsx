import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, Wifi, WifiOff, RefreshCw, Check, AlertCircle, MapPin, Info } from 'lucide-react';
import { toast } from 'sonner';
import { usePrinter, type PrinterConfig } from '@/hooks/usePrinter';
import { useStore } from '@/contexts/StoreContext';
import { useAuth } from '@/contexts/AuthContext';

export const PrinterSettings: React.FC = () => {
  const { printer, status, isLoading, isConnected, saveConfig, testConnection, refreshStatus } = usePrinter();
  const { selectedLocation, availableLocations } = useStore();
  const { user } = useAuth();
  
  // Get location name for display
  const currentLocationName = availableLocations.find(l => l.gid === selectedLocation)?.name || 'Unknown Location';
  
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [editName, setEditName] = useState('');
  const [isTesting, setIsTesting] = useState(false);

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
        {/* Connection Status */}
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
          <Button onClick={handleSave} disabled={isLoading || isTesting || !editIp.trim()}>
            Save Settings
          </Button>
          <Button 
            variant="outline" 
            onClick={handleTestConnection} 
            disabled={isLoading || isTesting || !editIp.trim()}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isTesting ? 'animate-spin' : ''}`} />
            Test Connection
          </Button>
          {printer?.ip && (
            <Button variant="ghost" onClick={refreshStatus} disabled={isLoading}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Status
            </Button>
          )}
        </div>

        {/* Network note */}
        <p className="text-xs text-muted-foreground">
          Note: The printer must be accessible from our cloud servers. For local network printers, 
          ensure your network allows incoming connections or use a VPN/tunnel solution.
        </p>
      </CardContent>
    </Card>
  );
};
