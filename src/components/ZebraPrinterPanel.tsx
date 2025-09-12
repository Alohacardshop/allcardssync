import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, Wifi, WifiOff, TestTube, Plus, RefreshCw, Settings } from "lucide-react";
import { toast } from "sonner";
import { useZebraNetwork } from "@/hooks/useZebraNetwork";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { generateSampleZPL } from '@/lib/zplSamples';

export function ZebraPrinterPanel() {
  const [workstationId, setWorkstationId] = useState<string>('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newPrinterIp, setNewPrinterIp] = useState('');
  const [newPrinterPort, setNewPrinterPort] = useState('9100');
  const [newPrinterName, setNewPrinterName] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  
  const {
    printers,
    selectedPrinter,
    setSelectedPrinterId,
    isConnected,
    isLoading,
    connectionError,
    refreshPrinters,
    addManualPrinter,
    testConnection,
    printZPL
  } = useZebraNetwork();

  // Get or create consistent workstation ID
  const getWorkstationId = () => {
    let id = localStorage.getItem('workstation-id');
    if (!id) {
      id = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', id);
    }
    return id;
  };

  useEffect(() => {
    setWorkstationId(getWorkstationId());
  }, []);

  const handleAddPrinter = async () => {
    const ip = newPrinterIp.trim();
    const port = parseInt(newPrinterPort) || 9100;
    const name = newPrinterName.trim() || `Zebra (${ip})`;

    if (!ip) {
      toast.error("IP address is required");
      return;
    }

    try {
      await addManualPrinter(ip, port, name);
      toast.success(`Printer ${name} added successfully`);
      setShowAddDialog(false);
      setNewPrinterIp('');
      setNewPrinterPort('9100');
      setNewPrinterName('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add printer");
    }
  };

  const handleTestConnection = async () => {
    if (!selectedPrinter) {
      toast.error("No printer selected");
      return;
    }

    setTestingConnection(true);
    try {
      const result = await testConnection(selectedPrinter);
      if (result) {
        toast.success("Connection test successful");
      } else {
        toast.error("Connection test failed - printer not reachable");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connection test failed");
    } finally {
      setTestingConnection(false);
    }
  };

  const runTestPrint = async () => {
    if (!selectedPrinter) {
      toast.error("No printer selected");
      return;
    }

    try {
      const testZPL = generateSampleZPL();
      const result = await printZPL(testZPL, {
        title: "ZPL Test Print",
        copies: 1
      });

      if (result.success) {
        toast.success(result.message || "Test print sent successfully");
      } else {
        throw new Error(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Test print error:', error);
      toast.error(error instanceof Error ? error.message : "Test print failed");
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Zebra Network Printing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Network Status:</span>
          <Badge variant={printers.length > 0 ? "default" : "destructive"} className="gap-1">
            {printers.length > 0 ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {printers.length > 0 ? "Connected" : "No Printers"}
          </Badge>
        </div>

        {!isConnected && connectionError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
              <WifiOff className="h-4 w-4" />
              Network Issue
            </div>
            <p className="text-sm text-muted-foreground">
              {connectionError}
            </p>
          </div>
        )}

        {/* Workstation ID */}
        <div className="text-xs text-muted-foreground">
          Workstation: {workstationId}
        </div>

        {/* Selected Printer Info */}
        {selectedPrinter && (
          <div className="p-3 bg-muted rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{selectedPrinter.name}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedPrinter.isSystemPrinter 
                    ? 'USB/Local Printer' 
                    : `${selectedPrinter.ip}:${selectedPrinter.port}`
                  }
                </div>
              </div>
              <Badge variant={selectedPrinter.isConnected ? "default" : "destructive"}>
                {selectedPrinter.isConnected ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refreshPrinters(true)}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Scan
            </Button>
            
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Network Printer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Network Printer</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="printer-ip">IP Address *</Label>
                    <Input
                      id="printer-ip"
                      placeholder="192.168.0.100"
                      value={newPrinterIp}
                      onChange={(e) => setNewPrinterIp(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="printer-port">Port</Label>
                    <Input
                      id="printer-port"
                      placeholder="9100"
                      value={newPrinterPort}
                      onChange={(e) => setNewPrinterPort(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="printer-name">Name (optional)</Label>
                    <Input
                      id="printer-name"
                      placeholder="Main Zebra Printer"
                      value={newPrinterName}
                      onChange={(e) => setNewPrinterName(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddPrinter}>
                      Add Printer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Test Functions */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Test Functions:</label>
          
          <Button 
            variant="outline"
            size="sm"
            onClick={handleTestConnection} 
            disabled={!selectedPrinter || testingConnection}
            className="w-full"
          >
            <Settings className="w-4 h-4 mr-2" />
            {testingConnection ? "Testing..." : "Test Connection"}
          </Button>

          <Button 
            className="w-full gap-2" 
            onClick={runTestPrint}
            disabled={!isConnected || !selectedPrinter}
          >
            <TestTube className="h-4 w-4" />
            Test Print (ZPL)
          </Button>
        </div>

        {/* Printer List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Available Printers:</label>
          </div>
          
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {printers.map((printer) => (
              <div key={printer.id} className="flex items-center gap-2 p-2 border rounded-md">
                <input
                  type="radio"
                  id={`printer-${printer.id}`}
                  name="selectedPrinter"
                  checked={selectedPrinter?.id === printer.id}
                  onChange={() => setSelectedPrinterId(printer)}
                  className="h-4 w-4"
                />
                
                <div className="flex-1 min-w-0">
                  <label 
                    htmlFor={`printer-${printer.id}`}
                    className="font-medium text-sm cursor-pointer block"
                  >
                    {printer.name}
                  </label>
                  <div className="text-xs text-muted-foreground">
                    {printer.isSystemPrinter 
                      ? 'USB/Local' 
                      : `${printer.ip}:${printer.port}`
                    }
                  </div>
                </div>
                
                <Badge variant={printer.isConnected ? "default" : "secondary"} className="text-xs">
                  {printer.isConnected ? "Online" : "Offline"}
                </Badge>
              </div>
            ))}
            
            {printers.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No printers found. Add a printer manually or check USB connection.
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Supports both USB-connected and network Zebra printers using ZPL.
          <br />
          USB printers are auto-detected, network printers use TCP/IP port 9100.
        </div>
      </CardContent>
    </Card>
  );
}