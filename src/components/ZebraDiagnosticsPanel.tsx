import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Activity, 
  Globe, 
  Settings, 
  Zap, 
  Scissors, 
  Send,
  TestTube,
  Eye,
  Timer
} from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { zebraNetworkService } from '@/lib/zebraNetworkService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// ZPL Commands for diagnostics
const ZPL_COMMANDS = {
  config: '^XA^HH^XZ',
  calibrateRestore: '^XA^JUS^XZ',
  calibrateGaps: '^XA^MNY^XZ', 
  calibrateSave: '^XA^JS^XZ',
  cutterEnable: '^XA^MMC^XZ',
  cutNow: '^XA^CN1^XZ',
  testPattern: '^XA^FO50,50^A0N,30,30^FDTest Pattern^FS^XZ'
};

export function ZebraDiagnosticsPanel() {
  const { selectedPrinter, testConnection } = useZebraNetwork();
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [rawZpl, setRawZpl] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPingMs, setLastPingMs] = useState<number | null>(null);

  // Initialize edit fields when printer changes
  React.useEffect(() => {
    if (selectedPrinter) {
      setEditIp(selectedPrinter.ip);
      setEditPort(selectedPrinter.port.toString());
    }
  }, [selectedPrinter]);

  const handlePing = async () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();
    
    try {
      const isOnline = await testConnection(selectedPrinter);
      const pingTime = Date.now() - startTime;
      setLastPingMs(pingTime);
      
      if (isOnline) {
        toast.success(`Ping successful (${pingTime}ms)`);
      } else {
        toast.error(`Ping failed (${pingTime}ms)`);
      }
    } catch (error) {
      const pingTime = Date.now() - startTime;
      toast.error(`Ping error: ${error instanceof Error ? error.message : 'Unknown error'} (${pingTime}ms)`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenWebUI = () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }
    window.open(`http://${selectedPrinter.ip}`, '_blank');
  };

  const sendZPLCommand = async (zpl: string, description: string) => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setIsLoading(true);
    try {
      const result = await zebraNetworkService.printZPLDirect(zpl, selectedPrinter.ip, selectedPrinter.port);
      
      if (result.success) {
        toast.success(`${description} sent successfully`);
      } else {
        throw new Error(result.error || `${description} failed`);
      }
    } catch (error) {
      toast.error(`${description} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigLabel = () => {
    sendZPLCommand(ZPL_COMMANDS.config, 'Config label');
  };

  const handleCalibrate = async () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setIsLoading(true);
    try {
      // Send calibration sequence
      await zebraNetworkService.printZPLDirect(ZPL_COMMANDS.calibrateRestore, selectedPrinter.ip, selectedPrinter.port);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait between commands
      
      await zebraNetworkService.printZPLDirect(ZPL_COMMANDS.calibrateGaps, selectedPrinter.ip, selectedPrinter.port);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await zebraNetworkService.printZPLDirect(ZPL_COMMANDS.calibrateSave, selectedPrinter.ip, selectedPrinter.port);
      
      toast.success('Calibration sequence completed');
    } catch (error) {
      toast.error(`Calibration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestCutter = async () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setIsLoading(true);
    try {
      // Enable cutter mode and cut now
      await zebraNetworkService.printZPLDirect(ZPL_COMMANDS.cutterEnable, selectedPrinter.ip, selectedPrinter.port);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await zebraNetworkService.printZPLDirect(ZPL_COMMANDS.cutNow, selectedPrinter.ip, selectedPrinter.port);
      
      toast.success('Cutter test sent - check if printer cut the media');
    } catch (error) {
      toast.error(`Cutter test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRawZPL = () => {
    if (!rawZpl.trim()) {
      toast.error('Enter ZPL code first');
      return;
    }
    sendZPLCommand(rawZpl, 'Raw ZPL');
  };

  if (!selectedPrinter) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Zebra Diagnostics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Select a printer to access diagnostics
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Zebra Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Printer Info */}
        <div className="p-3 bg-muted rounded-md">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="font-medium">{selectedPrinter.name}</div>
              <div className="text-sm text-muted-foreground">
                {selectedPrinter.ip}:{selectedPrinter.port}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastPingMs && (
                <Badge variant="outline" className="text-xs">
                  <Timer className="h-3 w-3 mr-1" />
                  {lastPingMs}ms
                </Badge>
              )}
              <Badge variant={selectedPrinter.isConnected ? "default" : "secondary"}>
                {selectedPrinter.isConnected ? "Online" : selectedPrinter.isConnected === false ? "Offline" : "Unknown"}
              </Badge>
            </div>
          </div>
          
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Edit Connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Printer Connection</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>IP Address</Label>
                  <Input
                    value={editIp}
                    onChange={(e) => setEditIp(e.target.value)}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <Input
                    value={editPort}
                    onChange={(e) => setEditPort(e.target.value)}
                    placeholder="9100"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => {
                    // This would need to be implemented to update the printer
                    setShowEditDialog(false);
                    toast.info('Connection update would need to be implemented');
                  }}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Separator />

        {/* Network Actions */}
        <div className="space-y-2">
          <Label className="font-medium">Network Actions</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={handlePing}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Activity className="h-4 w-4" />
              Ping
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleOpenWebUI}
              className="flex items-center gap-2"
            >
              <Globe className="h-4 w-4" />
              Web UI
            </Button>
          </div>
        </div>

        <Separator />

        {/* Printer Actions */}
        <div className="space-y-2">
          <Label className="font-medium">Printer Actions</Label>
          <div className="space-y-2">
            <Button 
              variant="outline" 
              onClick={handleConfigLabel}
              disabled={isLoading}
              className="w-full flex items-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Print Config Label
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleCalibrate}
              disabled={isLoading}
              className="w-full flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              Calibrate (Gap Sensor)
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleTestCutter}
              disabled={isLoading}
              className="w-full flex items-center gap-2"
            >
              <Scissors className="h-4 w-4" />
              Test Cutter Mode & Cut
            </Button>
          </div>
        </div>

        <Separator />

        {/* Raw ZPL */}
        <div className="space-y-2">
          <Label className="font-medium">Send Raw ZPL</Label>
          <Textarea
            placeholder="^XA^FO50,50^A0N,30,30^FDHello World^FS^XZ"
            value={rawZpl}
            onChange={(e) => setRawZpl(e.target.value)}
            className="font-mono text-sm"
            rows={3}
          />
          <Button 
            onClick={handleSendRawZPL}
            disabled={isLoading || !rawZpl.trim()}
            className="w-full flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            Send ZPL
          </Button>
        </div>

        {/* Quick ZPL Examples */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="font-medium">Quick Examples:</div>
          <div>Config: <code>^XA^HH^XZ</code></div>
          <div>Test: <code>^XA^FO50,50^A0N,30^FDTest^FS^XZ</code></div>
          <div>Cut: <code>^XA^CN1^XZ</code></div>
        </div>
      </CardContent>
    </Card>
  );
}