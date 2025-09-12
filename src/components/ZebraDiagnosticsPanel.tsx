import React, { useState, useEffect } from 'react';
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
  Timer,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { useZebraNetwork } from '@/hooks/useZebraNetwork';
import { zebraNetworkService, type PrinterStatus } from '@/lib/zebraNetworkService';
import { useLabelSettings } from '@/hooks/useLabelSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PrinterStatusModal } from '@/components/PrinterStatusModal';

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

// Helper function to get status text
function getStatusText(status: PrinterStatus): string {
  const issues = [];
  if (status.paused) issues.push('Paused');
  if (status.headOpen) issues.push('Head Open');
  if (status.mediaOut) issues.push('Media Out');
  return issues.length > 0 ? issues.join(', ') : 'Not Ready';
}

export function ZebraDiagnosticsPanel() {
  const { selectedPrinter, testConnection, printerStatus: hookPrinterStatus } = useZebraNetwork();
  const { settings } = useLabelSettings();
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('9100');
  const [rawZpl, setRawZpl] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [lastPingMs, setLastPingMs] = useState<number | null>(null);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);

  // Use hook status as primary, local status as override
  const currentStatus = printerStatus || hookPrinterStatus;

  // Initialize edit fields when printer changes
  useEffect(() => {
    if (selectedPrinter) {
      setEditIp(selectedPrinter.ip);
      setEditPort(selectedPrinter.port.toString());
    }
  }, [selectedPrinter]);

  // Query printer status
  const handleQueryStatus = async () => {
    if (!selectedPrinter) {
      toast.error('No printer selected');
      return;
    }

    setIsLoading(true);
    try {
      const status = await zebraNetworkService.queryStatus(selectedPrinter.ip, selectedPrinter.port);
      setPrinterStatus(status);
      
      if (status.ready) {
        toast.success('Printer status retrieved - Ready');
      } else {
        const issues = [];
        if (status.paused) issues.push('paused');
        if (status.headOpen) issues.push('head open');
        if (status.mediaOut) issues.push('media out');
        toast.warning(`Printer status retrieved - Issues: ${issues.join(', ')}`);
      }
    } catch (error) {
      toast.error(`Status query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setPrinterStatus({
        ready: false,
        paused: false,
        headOpen: false,
        mediaOut: false,
        raw: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      setIsLoading(false);
    }
  };

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
      // Send the updated cut now sequence
      const cutZPL = '^XA\n^MMC\n^XZ';
      await zebraNetworkService.printZPLDirect(cutZPL, selectedPrinter.ip, selectedPrinter.port);
      
      toast.success('Cut now command sent - check if printer cut the media', {
        description: 'If no cut occurred, your printer may not support cutter mode or needs SGD commands'
      });
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
                {currentStatus?.ssid && (
                  <span className="ml-2">• WiFi: {currentStatus.ssid}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastPingMs && (
                <Badge variant="outline" className="text-xs">
                  <Timer className="h-3 w-3 mr-1" />
                  {lastPingMs}ms
                </Badge>
              )}
              {currentStatus && (
                <Badge 
                  variant={currentStatus.ready ? "default" : "destructive"}
                  className="flex items-center gap-1"
                >
                  {currentStatus.ready ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {currentStatus.ready ? "Ready" : getStatusText(currentStatus)}
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
          <div className="grid grid-cols-3 gap-2">
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
              onClick={() => setShowStatusModal(true)}
              disabled={isLoading || !currentStatus}
              className="flex items-center gap-2"
            >
              <Info className="h-4 w-4" />
              Status
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
          
          <Button 
            variant="outline" 
            onClick={handleQueryStatus}
            disabled={isLoading}
            className="w-full flex items-center gap-2"
          >
            <Activity className="h-4 w-4" />
            Query Status (~HS)
          </Button>
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
            
            {settings.hasCutter && (
              <Button 
                variant="outline" 
                onClick={handleTestCutter}
                disabled={isLoading}
                className="w-full flex items-center gap-2"
              >
                <Scissors className="h-4 w-4" />
                Cut Now (Diagnose)
              </Button>
            )}
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
          <div>Cut: <code>^XA^MMC^XZ</code></div>
        </div>
        
        {/* Status Modal */}
        <PrinterStatusModal
          open={showStatusModal}
          onOpenChange={setShowStatusModal}
          status={currentStatus}
          printerIp={selectedPrinter.ip}
        />
      </CardContent>
    </Card>
  );
}