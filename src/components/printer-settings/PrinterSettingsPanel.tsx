import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Cloud, 
  Wifi, 
  Settings, 
  Save, 
  TestTube, 
  RefreshCw, 
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  Info,
  Printer
} from "lucide-react";
import { usePrintNode } from "@/contexts/PrintNodeContext";
import { useUserPrinterPreferences } from "@/hooks/useUserPrinterPreferences";
import { useZebraNetwork } from "@/hooks/useZebraNetwork";
import { useLocalStorageString } from "@/hooks/useLocalStorage";
import { zebraNetworkService } from "@/lib/zebraNetworkService";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export function PrinterSettingsPanel() {
  // PrintNode state
  const [localApiKey, setLocalApiKey] = useState('');
  const {
    isConnected: printNodeConnected,
    isLoading: printNodeLoading,
    printers: printNodePrinters,
    selectedPrinterId: printNodeSelectedId,
    apiKey: printNodeApiKey,
    testConnection: testPrintNodeConnection,
    saveApiKey: savePrintNodeApiKey,
    setSelectedPrinterId: setPrintNodeSelectedId,
    refreshPrinters: refreshPrintNodePrinters
  } = usePrintNode();
  
  const { savePreference } = useUserPrinterPreferences();

  // Zebra Network state
  const {
    printers: zebraPrinters,
    selectedPrinter: zebraSelectedPrinter,
    setSelectedPrinterId: setZebraSelectedId,
    isConnected: zebraConnected,
    isLoading: zebraLoading,
    refreshPrinters: refreshZebraPrinters,
    addManualPrinter,
    testConnection: testZebraConnection
  } = useZebraNetwork();

  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [newPrinterIp, setNewPrinterIp] = useState('');
  const [newPrinterPort, setNewPrinterPort] = useState('9100');
  const [newPrinterName, setNewPrinterName] = useState('');

  // ZPL Default Settings
  const [defaultIp, setDefaultIp] = useLocalStorageString('zpl-default-ip', '192.168.1.70');
  const [defaultPort, setDefaultPort] = useLocalStorageString('zpl-default-port', '9100');
  const [defaultSpeed, setDefaultSpeed] = useLocalStorageString('zpl-default-speed', '4');
  const [defaultDarkness, setDefaultDarkness] = useLocalStorageString('zpl-default-darkness', '10');
  const [defaultCutMode, setDefaultCutMode] = useLocalStorageString('zpl-default-cut', 'true');
  const [defaultDpi, setDefaultDpi] = useLocalStorageString('zpl-default-dpi', '203');
  const [hasCutter, setHasCutter] = useLocalStorageString('zpl-printer-has-cutter', 'false');

  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // PrintNode handlers
  const handleSaveApiKey = async () => {
    const keyToSave = localApiKey.trim() || printNodeApiKey.trim();
    if (!keyToSave) return;
    
    try {
      await savePrintNodeApiKey(keyToSave);
      setLocalApiKey('');
      toast.success('PrintNode API key saved');
    } catch (error) {
      toast.error('Failed to save API key');
    }
  };

  const handlePrintNodePrinterChange = async (printerId: string) => {
    const printer = printNodePrinters.find(p => p.id.toString() === printerId);
    
    setPrintNodeSelectedId(printerId);
    
    try {
      await savePreference({
        printer_type: 'printnode',
        printer_id: printerId,
        printer_name: printer?.name || 'PrintNode Printer'
      });
      toast.success('Default printer updated');
    } catch (error) {
      logger.error('Failed to save printer preference', error as Error, undefined, 'printer-settings');
    }
  };

  // Zebra Network handlers
  const handleAddZebraPrinter = async () => {
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
      setShowAddPrinter(false);
      setNewPrinterIp('');
      setNewPrinterPort('9100');
      setNewPrinterName('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add printer");
    }
  };

  const handleTestDefaultConnection = async () => {
    if (!defaultIp.trim()) {
      toast.error('Please enter a printer IP address');
      return;
    }

    setTestLoading(true);
    try {
      const isConnected = await zebraNetworkService.testConnection(defaultIp.trim(), parseInt(defaultPort));
      
      if (isConnected) {
        toast.success(`✅ Connection successful to ${defaultIp}:${defaultPort}`);
      } else {
        toast.error(`❌ Could not connect to ${defaultIp}:${defaultPort}`);
      }
    } catch (error) {
      toast.error(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handlePrintTest = async () => {
    if (!defaultIp.trim()) {
      toast.error('Please enter a printer IP address');
      return;
    }

    setTestLoading(true);
    try {
      const testZpl = `^XA
^LL203^PR${defaultSpeed}^MD${defaultDarkness}
^FO20,20^A0N,30,30^FDTEST PRINT^FS
^FO20,60^A0N,20,20^FD${new Date().toLocaleTimeString()}^FS
^FO20,90^A0N,20,20^FDSettings: ${defaultSpeed}ips, ${defaultDarkness}dark^FS
^FO20,120^A0N,20,20^FDIP: ${defaultIp}:${defaultPort}^FS
${defaultCutMode === 'true' && hasCutter === 'true' ? '^MMB' : ''}
^PQ1
^XZ`;

      const result = await zebraNetworkService.printZPLDirect(
        testZpl,
        defaultIp.trim(),
        parseInt(defaultPort),
        { timeoutMs: 10000 }
      );

      if (result.success) {
        toast.success('✅ Test label sent successfully');
      } else {
        throw new Error(result.error || 'Print test failed');
      }
    } catch (error) {
      toast.error(`Print test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaveLoading(true);
    try {
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Printer Settings</h2>
          <p className="text-muted-foreground">Configure all printer connections and default settings</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            refreshPrintNodePrinters();
            refreshZebraPrinters();
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
        </div>
      </div>

      <Accordion type="multiple" defaultValue={["printnode", "defaults"]} className="w-full space-y-4">
        {/* PrintNode Cloud Section */}
        <AccordionItem value="printnode">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-semibold">PrintNode Cloud</div>
                  <div className="text-sm text-muted-foreground">Cloud-based printing service</div>
                </div>
                {printNodeConnected && (
                  <Badge variant="secondary" className="ml-auto mr-4">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-4">
                {/* Connection Status */}
                <div className="flex items-center gap-2">
                  {printNodeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : printNodeConnected ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm">
                    {printNodeLoading ? 'Testing connection...' : printNodeConnected ? 'Connected to PrintNode' : 'Not connected'}
                  </span>
                  {printNodeConnected && (
                    <Badge variant="secondary" className="ml-auto">
                      {printNodePrinters.length} printer(s) available
                    </Badge>
                  )}
                </div>

                {/* API Key Configuration */}
                <div className="space-y-2">
                  <Label htmlFor="printnode-api-key">PrintNode API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="printnode-api-key"
                      type="password"
                      placeholder={printNodeApiKey ? "Enter new API key to replace current" : "Enter your PrintNode API key"}
                      value={localApiKey}
                      onChange={(e) => setLocalApiKey(e.target.value)}
                    />
                    <Button onClick={handleSaveApiKey} disabled={printNodeLoading}>
                      {printNodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from <a href="https://app.printnode.com/app/apikeys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">PrintNode Dashboard</a>
                  </p>
                </div>

                {/* Printer Selection */}
                {printNodeConnected && printNodePrinters.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="printnode-printer">Default PrintNode Printer</Label>
                    <Select value={printNodeSelectedId || ''} onValueChange={handlePrintNodePrinterChange}>
                      <SelectTrigger id="printnode-printer">
                        <SelectValue placeholder="Select a printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {printNodePrinters.map(printer => (
                          <SelectItem key={printer.id} value={printer.id.toString()}>
                            {printer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Test Connection Button */}
                {printNodeConnected && (
                  <Button variant="outline" onClick={testPrintNodeConnection} disabled={printNodeLoading}>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test Connection
                  </Button>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Network Printers Section */}
        <AccordionItem value="network">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Wifi className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-semibold">Network Printers</div>
                  <div className="text-sm text-muted-foreground">Direct network printer connections</div>
                </div>
                {zebraPrinters.length > 0 && (
                  <Badge variant="secondary" className="ml-auto mr-4">
                    {zebraPrinters.length} printer(s)
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-4">
                {/* Saved Printers List */}
                {zebraPrinters.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Saved Printers</Label>
                    <div className="space-y-2">
                      {zebraPrinters.map(printer => (
                        <div
                          key={printer.id}
                          className={`p-3 border rounded-lg flex items-center justify-between ${
                            zebraSelectedPrinter?.id === printer.id ? 'border-primary bg-primary/5' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Printer className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">{printer.name}</div>
                              <div className="text-xs text-muted-foreground">{printer.ip}:{printer.port}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {zebraSelectedPrinter?.id === printer.id ? (
                              <Badge variant="secondary">Default</Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  setZebraSelectedId(printer);
                                  try {
                                    await savePreference({
                                      printer_type: 'zebra',
                                      printer_id: printer.id,
                                      printer_name: printer.name,
                                      printer_ip: printer.ip,
                                      printer_port: printer.port
                                    });
                                    toast.success('Default printer updated');
                                  } catch (error) {
                                    logger.error('Failed to save printer preference', error as Error, undefined, 'printer-settings');
                                  }
                                }}
                              >
                                Set Default
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      No network printers configured yet. Add your first printer below.
                    </AlertDescription>
                  </Alert>
                )}

                <Separator />

                {/* Add Manual Printer */}
                {!showAddPrinter ? (
                  <Button onClick={() => setShowAddPrinter(true)} variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Network Printer
                  </Button>
                ) : (
                  <div className="space-y-3 p-4 border rounded-lg">
                    <div className="space-y-2">
                      <Label htmlFor="printer-name">Printer Name</Label>
                      <Input
                        id="printer-name"
                        placeholder="Zebra ZD421"
                        value={newPrinterName}
                        onChange={(e) => setNewPrinterName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2 space-y-2">
                        <Label htmlFor="printer-ip">IP Address</Label>
                        <Input
                          id="printer-ip"
                          placeholder="192.168.1.70"
                          value={newPrinterIp}
                          onChange={(e) => setNewPrinterIp(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="printer-port">Port</Label>
                        <Input
                          id="printer-port"
                          placeholder="9100"
                          value={newPrinterPort}
                          onChange={(e) => setNewPrinterPort(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddZebraPrinter} disabled={zebraLoading}>
                        {zebraLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Add Printer
                      </Button>
                      <Button variant="outline" onClick={() => setShowAddPrinter(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Discover Button */}
                <Button
                  variant="outline"
                  onClick={() => refreshZebraPrinters(true)}
                  disabled={zebraLoading}
                  className="w-full"
                >
                  {zebraLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Discover Printers on Network
                </Button>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Default Settings Section */}
        <AccordionItem value="defaults">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-semibold">Default Print Settings</div>
                  <div className="text-sm text-muted-foreground">Configure default ZPL printer parameters</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-4">
                {/* Network Settings */}
                <div className="space-y-3">
                  <Label className="text-base">Network Settings</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <Label htmlFor="default-ip">Default Printer IP</Label>
                      <Input
                        id="default-ip"
                        value={defaultIp}
                        onChange={(e) => setDefaultIp(e.target.value)}
                        placeholder="192.168.1.70"
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="default-port">Port</Label>
                      <Input
                        id="default-port"
                        value={defaultPort}
                        onChange={(e) => setDefaultPort(e.target.value)}
                        placeholder="9100"
                      />
                    </div>
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Tip:</strong> Reserve this IP address in your router's DHCP settings to prevent IP changes.
                    </AlertDescription>
                  </Alert>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleTestDefaultConnection}
                      disabled={testLoading || !defaultIp.trim()}
                      variant="outline"
                      size="sm"
                    >
                      {testLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Test Connection
                    </Button>
                    <Button
                      onClick={handlePrintTest}
                      disabled={testLoading || !defaultIp.trim()}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <TestTube className="h-4 w-4" />
                      Print Test Label
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Print Settings */}
                <div className="space-y-3">
                  <Label className="text-base">Print Parameters</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="default-dpi">Resolution (DPI)</Label>
                      <Select value={defaultDpi} onValueChange={setDefaultDpi}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="203">203 DPI (Standard)</SelectItem>
                          <SelectItem value="300">300 DPI (High Resolution)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="default-speed">Print Speed (IPS)</Label>
                      <Select value={defaultSpeed} onValueChange={setDefaultSpeed}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2 IPS (Slow)</SelectItem>
                          <SelectItem value="3">3 IPS</SelectItem>
                          <SelectItem value="4">4 IPS (Standard)</SelectItem>
                          <SelectItem value="5">5 IPS</SelectItem>
                          <SelectItem value="6">6 IPS (Fast)</SelectItem>
                          <SelectItem value="8">8 IPS</SelectItem>
                          <SelectItem value="10">10 IPS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="default-darkness">Print Darkness (0-30)</Label>
                      <Input
                        id="default-darkness"
                        type="number"
                        min="0"
                        max="30"
                        value={defaultDarkness}
                        onChange={(e) => setDefaultDarkness(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Lower = lighter, Higher = darker. Start with 10-12.
                      </p>
                    </div>
                    <div className="space-y-3 pt-6">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="default-cut"
                          checked={defaultCutMode === 'true'}
                          onCheckedChange={(checked) => setDefaultCutMode(checked ? 'true' : 'false')}
                        />
                        <Label htmlFor="default-cut">Cut at end by default</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="has-cutter"
                          checked={hasCutter === 'true'}
                          onCheckedChange={(checked) => setHasCutter(checked ? 'true' : 'false')}
                        />
                        <Label htmlFor="has-cutter">This printer has a cutter</Label>
                      </div>
                    </div>
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Cut commands (^MMB) are only sent when both "Cut at end" and "This printer has a cutter" are enabled.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Preferences Section */}
        <AccordionItem value="preferences">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-semibold">Preferences</div>
                  <div className="text-sm text-muted-foreground">Additional printing preferences</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Workstation ID: {localStorage.getItem('workstation-id') || 'Not set'}
                  </AlertDescription>
                </Alert>
                
                <div className="space-y-2">
                  <Label>Selected Printer Type</Label>
                  <div className="p-3 border rounded-lg">
                    {printNodeConnected && printNodeSelectedId ? (
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-primary" />
                        <span className="text-sm">PrintNode Cloud Printer</span>
                        <Badge variant="secondary" className="ml-auto">Active</Badge>
                      </div>
                    ) : zebraSelectedPrinter ? (
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-primary" />
                        <span className="text-sm">Network Printer ({zebraSelectedPrinter.name})</span>
                        <Badge variant="secondary" className="ml-auto">Active</Badge>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No printer selected</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      {/* Save All Button */}
      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={saveLoading} className="gap-2">
          <Save className="h-4 w-4" />
          {saveLoading ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
