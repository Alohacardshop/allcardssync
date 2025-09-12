import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Navigation } from "@/components/Navigation";
import { useLocalStorageString } from "@/hooks/useLocalStorage";
import { Settings, Save, Wifi, Info, TestTube } from "lucide-react";
import { zebraNetworkService } from "@/lib/zebraNetworkService";

function useSEO(opts: { title: string; description?: string }) {
  useEffect(() => {
    document.title = opts.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", opts.description || "");
    else if (opts.description) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = opts.description;
      document.head.appendChild(m);
    }
  }, [opts.title, opts.description]);
}

export default function ZPLSettings() {
  useSEO({ 
    title: "ZPL Printer Settings | Aloha", 
    description: "Configure default ZPL printer settings, IP addresses, and print parameters." 
  });

  // Default printer settings
  const [defaultIp, setDefaultIp] = useLocalStorageString('zpl-default-ip', '192.168.1.70');
  const [defaultPort, setDefaultPort] = useLocalStorageString('zpl-default-port', '9100');
  const [defaultSpeed, setDefaultSpeed] = useLocalStorageString('zpl-default-speed', '4');
  const [defaultDarkness, setDefaultDarkness] = useLocalStorageString('zpl-default-darkness', '10');
  const [defaultCutMode, setDefaultCutMode] = useLocalStorageString('zpl-default-cut', 'true');
  const [defaultDpi, setDefaultDpi] = useLocalStorageString('zpl-default-dpi', '203');
  const [hasCutter, setHasCutter] = useLocalStorageString('zpl-printer-has-cutter', 'false');
  
  // UI state
  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const handleSaveSettings = async () => {
    setSaveLoading(true);
    try {
      // Settings are automatically saved via localStorage hooks
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestConnection = async () => {
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ZPL Printer Settings</h1>
            <p className="text-muted-foreground mt-1">Configure default printer settings and network parameters.</p>
          </div>
          <Navigation />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Network Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Network Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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

              {/* IP Reservation Callout */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Tip:</strong> Reserve this IP address in your router's DHCP settings to avoid future IP changes. 
                  This ensures your printer always gets the same IP address when it connects to your network.
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button
                  onClick={handleTestConnection}
                  disabled={testLoading || !defaultIp.trim()}
                  variant="outline"
                  size="sm"
                >
                  {testLoading ? "Testing..." : "Test Connection"}
                </Button>
                <Button
                  onClick={handlePrintTest}
                  disabled={testLoading || !defaultIp.trim()}
                  variant="outline" 
                  size="sm"
                  className="gap-2"
                >
                  <TestTube className="h-4 w-4" />
                  {testLoading ? "Printing..." : "Print Test"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Print Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Default Print Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="space-y-3">
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
                  Non-cutter printers will safely ignore these commands.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={saveLoading}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {saveLoading ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}