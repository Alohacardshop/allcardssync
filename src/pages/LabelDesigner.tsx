import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { ZebraPrinterPanel } from "@/components/ZebraPrinterPanel";
import { useZebraNetwork } from "@/hooks/useZebraNetwork";
import { ZebraPrinterSelectionDialog } from '@/components/ZebraPrinterSelectionDialog';
import { useLocalStorageString } from "@/hooks/useLocalStorage";
import { buildZPLWithCut, generateBoxedLayoutZPL, type LabelFieldConfig, mmToDots } from "@/lib/zpl";
import { zebraNetworkService } from "@/lib/zebraNetworkService";
import { testDirectPrinting } from "@/lib/zebraTestUtils";
import { LabelPreviewCanvas } from "@/components/LabelPreviewCanvas";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Eye, Printer, ChevronDown, Home, Save } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRawTemplates } from "@/hooks/useRawTemplates";

function useSEO(opts: { title: string; description?: string; canonical?: string }) {
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
    const linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = opts.canonical || window.location.href;
    if (linkCanonical) linkCanonical.href = href; else { const l = document.createElement("link"); l.rel = "canonical"; l.href = href; document.head.appendChild(l); }
  }, [opts.title, opts.description, opts.canonical]);
}

export default function LabelDesigner() {
  useSEO({ 
    title: "ZPL Label Designer 2x1 in | Aloha", 
    description: "Design and print 2x1 inch labels with ZPL commands for Zebra thermal printers." 
  });

  const location = useLocation();
  const { printZPL, isConnected: zebraConnected, selectedPrinter } = useZebraNetwork();
  const [printLoading, setPrintLoading] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [pendingPrintData, setPendingPrintData] = useState<string | null>(null);

  // Raw templates for Label Designer persistence
  const { templates: rawTemplates, defaultTemplate, saveTemplate, setAsDefault, loading: templatesLoading } = useRawTemplates();
  
  // Ref for accessing canvas export function
  const previewCanvasRef = useRef<any>(null);

  // ZPL Settings with localStorage persistence
  const [labelWidthMm, setLabelWidthMm] = useLocalStorageString('zpl-width-mm', '50.8'); // 2 inches
  const [labelHeightMm, setLabelHeightMm] = useLocalStorageString('zpl-height-mm', '25.4'); // 1 inch
  const [zplDpi, setZplDpi] = useLocalStorageString('zpl-dpi', '203');
  const [zplSpeed, setZplSpeed] = useLocalStorageString('zpl-speed', '4');
  const [zplDarkness, setZplDarkness] = useLocalStorageString('zpl-darkness', '10');
  const [zplCopies, setZplCopies] = useLocalStorageString('zpl-copies', '1');
  const [cutAtEnd, setCutAtEnd] = useLocalStorageString('zpl-cut-at-end', 'true');
  const [printerIp, setPrinterIp] = useLocalStorageString('zpl-printer-ip', '192.168.1.70');
  const [printerPort, setPrinterPort] = useLocalStorageString('zpl-printer-port', '9100');

  // Field configuration with localStorage persistence
  const [includeTitle, setIncludeTitle] = useLocalStorageString('field-title', 'true');
  const [includeSku, setIncludeSku] = useLocalStorageString('field-sku', 'true');
  const [includePrice, setIncludePrice] = useLocalStorageString('field-price', 'true');
  const [includeLot, setIncludeLot] = useLocalStorageString('field-lot', 'false');
  const [includeCondition, setIncludeCondition] = useLocalStorageString('field-condition', 'true');
  const [barcodeMode, setBarcodeMode] = useLocalStorageString('barcode-mode', 'barcode');
  
  // State for showGuides option
  const [showGuides, setShowGuides] = useLocalStorageString('labelDesigner_showGuides', 'false');

  // Label data - pre-fill from route state if coming from inventory
  const [title, setTitle] = useState(location.state?.title || "POKEMON GENGAR VMAX #020");
  const [sku, setSku] = useState(location.state?.sku || "120979260");
  const [price, setPrice] = useState(location.state?.price || "1000");
  const [lot, setLot] = useState(location.state?.lot || "LOT-000001");
  const [condition, setCondition] = useState(location.state?.condition || "Near Mint");
  const [barcodeValue, setBarcodeValue] = useState(location.state?.barcode || location.state?.sku || "120979260");
  
  // Preview ZPL
  const [previewZpl, setPreviewZpl] = useState("");

  const labelData = {
    title,
    sku,
    price,
    lot,
    condition,
    barcode: barcodeValue
  };

  const fieldConfig: LabelFieldConfig = {
    includeTitle: includeTitle === 'true',
    includeSku: includeSku === 'true',
    includePrice: includePrice === 'true',
    includeLot: includeLot === 'true',
    includeCondition: includeCondition === 'true',
    barcodeMode: barcodeMode as 'qr' | 'barcode' | 'none'
  };

  const zplSettings = { 
    printDensity: parseInt(zplDarkness), 
    printSpeed: parseInt(zplSpeed), 
    labelLength: mmToDots(parseFloat(labelHeightMm), parseInt(zplDpi)) 
  };

  // Update preview when data or config changes
  useEffect(() => {
    try {
      const zpl = generateBoxedLayoutZPL(labelData, fieldConfig, zplSettings);
      setPreviewZpl(zpl);
    } catch (error) {
      console.error('Failed to generate ZPL preview:', error);
      setPreviewZpl('// Error generating preview');
    }
  }, [labelData, fieldConfig, zplSettings]);

  // Load default template settings on mount
  useEffect(() => {
    if (defaultTemplate && !templatesLoading) {
      const config = defaultTemplate.canvas?.fieldConfig;
      if (config) {
        setIncludeTitle(config.includeTitle ? 'true' : 'false');
        setIncludeSku(config.includeSku ? 'true' : 'false'); 
        setIncludePrice(config.includePrice ? 'true' : 'false');
        setIncludeLot(config.includeLot ? 'true' : 'false');
        setIncludeCondition(config.includeCondition ? 'true' : 'false');
        setBarcodeMode(config.barcodeMode || 'barcode');
      }

      const data = defaultTemplate.canvas?.labelData;
      if (data && !location.state) {
        setTitle(data.title || '');
        setSku(data.sku || '');
        setPrice(data.price || '');
        setLot(data.lot || '');
        setCondition(data.condition || '');
        setBarcodeValue(data.barcode || '');
      }
    }
  }, [defaultTemplate, templatesLoading, location.state]);

  // Save current configuration to database
  const handleSaveTemplate = async () => {
    setSaveLoading(true);
    try {
      const result = await saveTemplate(
        'ZPL Barcode Template',
        fieldConfig,
        labelData,
        zplSettings,
        defaultTemplate?.id
      );

      if (result) {
        toast.success('Template saved successfully');
      } else {
        toast.error('Failed to save template');
      }
    } catch (error) {
      console.error('Save template error:', error);
      toast.error('Failed to save template');
    } finally {
      setSaveLoading(false);
    }
  };

  // Generate ZPL with current settings
  const generateCurrentZPL = (isTest = false): string => {
    const testData = isTest ? {
      title: "TEST LABEL",
      sku: "TEST-001", 
      price: "99.99",
      lot: "TEST-LOT",
      condition: "Test",
      barcode: "123456789"
    } : labelData;

    return buildZPLWithCut({
      widthMm: parseFloat(labelWidthMm),
      heightMm: parseFloat(labelHeightMm),
      dpi: parseInt(zplDpi) as 203 | 300,
      speedIps: parseInt(zplSpeed),
      darkness: parseInt(zplDarkness),
      copies: parseInt(zplCopies),
      elements: []
    }, cutAtEnd === 'true');
  };

  // Direct network print using new ZPL service
  const handleDirectPrint = async (isTest = false) => {
    if (!printerIp.trim()) {
      toast.error('Please enter a printer IP address');
      return;
    }

    setPrintLoading(true);
    try {
      const zpl = isTest ? 
        generateCurrentZPL(true) : 
        generateBoxedLayoutZPL(labelData, fieldConfig, zplSettings);
      
      const finalZpl = cutAtEnd === 'true' ? 
        buildZPLWithCut({
          widthMm: parseFloat(labelWidthMm),
          heightMm: parseFloat(labelHeightMm),
          dpi: parseInt(zplDpi) as 203 | 300,
          speedIps: parseInt(zplSpeed),
          darkness: parseInt(zplDarkness),
          copies: parseInt(zplCopies),
          elements: []
        }, true) :
        zpl;

      const result = await zebraNetworkService.printZPLDirect(
        finalZpl, 
        printerIp.trim(), 
        parseInt(printerPort),
        { timeoutMs: 10000 }
      );

      if (result.success) {
        setHasPrinted(true);
        toast.success(`Label printed successfully: ${result.message}`);
      } else {
        throw new Error(result.error || 'Print failed');
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error(`Print failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPrintLoading(false);
    }
  };

  // Zebra printer print (using printer object)
  const handleZebraPrint = async (isTest = false) => {
    if (!selectedPrinter) {
      toast.error('No Zebra printer selected');
      return;
    }

    setPrintLoading(true);
    try {
      const zpl = isTest ?
        generateCurrentZPL(true) :
        generateBoxedLayoutZPL(labelData, fieldConfig, zplSettings);

      const finalZpl = cutAtEnd === 'true' ? 
        buildZPLWithCut({
          widthMm: parseFloat(labelWidthMm),
          heightMm: parseFloat(labelHeightMm),
          dpi: parseInt(zplDpi) as 203 | 300,
          speedIps: parseInt(zplSpeed),
          darkness: parseInt(zplDarkness),
          copies: parseInt(zplCopies),
          elements: []
        }, true) :
        zpl;

      const result = await printZPL(finalZpl, {
        title: isTest ? 'ZPL Test Label' : 'ZPL Label Print',
        copies: parseInt(zplCopies)
      });

      if (result?.success) {
        setHasPrinted(true);
        toast.success(`Label sent to printer successfully: ${result.message || 'Success'}`);
      } else {
        throw new Error(result?.error || 'Print failed');
      }
    } catch (error) {
      console.error('Print failed:', error);
      toast.error(`Print failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPrintLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">ZPL Label Designer</h1>
            <p className="text-muted-foreground mt-1">Design and print 2x1 inch labels using ZPL commands for Zebra thermal printers.</p>
          </div>
          <Navigation />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          
          {/* Left: Label Configuration */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Label Content
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Label Data */}
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                    <Input 
                      id="title" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Product name"
                      className="mt-1"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="price" className="text-sm font-medium">Price</Label>
                      <Input 
                        id="price" 
                        value={price} 
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="99.99"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="condition" className="text-sm font-medium">Condition</Label>
                      <Select value={condition} onValueChange={setCondition}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gem Mint">Gem Mint</SelectItem>
                          <SelectItem value="Mint">Mint</SelectItem>
                          <SelectItem value="Near Mint">Near Mint</SelectItem>
                          <SelectItem value="Excellent">Excellent</SelectItem>
                          <SelectItem value="Very Good">Very Good</SelectItem>
                          <SelectItem value="Good">Good</SelectItem>
                          <SelectItem value="Poor">Poor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="barcode" className="text-sm font-medium">Barcode Data</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <Input 
                        id="barcode" 
                        value={barcodeValue} 
                        onChange={(e) => setBarcodeValue(e.target.value)}
                        placeholder="123456789"
                      />
                        <Select value={barcodeMode} onValueChange={setBarcodeMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="barcode">Code128 (Recommended)</SelectItem>
                            <SelectItem value="qr">QR Code</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ZPL Settings */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">ZPL Settings</h3>
                  
                  {/* Size */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Width (mm)</Label>
                      <Input 
                        type="number"
                        value={labelWidthMm} 
                        onChange={(e) => setLabelWidthMm(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Height (mm)</Label>
                      <Input 
                        type="number"
                        value={labelHeightMm} 
                        onChange={(e) => setLabelHeightMm(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  {/* DPI & Speed */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">DPI</Label>
                      <Select value={zplDpi} onValueChange={setZplDpi}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="203">203 DPI</SelectItem>
                          <SelectItem value="300">300 DPI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Speed (IPS)</Label>
                      <Input 
                        type="number"
                        min="1"
                        max="14"
                        value={zplSpeed} 
                        onChange={(e) => setZplSpeed(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  {/* Darkness & Copies */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Darkness (0-30)</Label>
                      <Input 
                        type="number"
                        min="0"
                        max="30"
                        value={zplDarkness} 
                        onChange={(e) => setZplDarkness(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Copies</Label>
                      <Input 
                        type="number"
                        min="1"
                        value={zplCopies} 
                        onChange={(e) => setZplCopies(e.target.value)}
                        className="text-xs h-8"
                      />
                    </div>
                  </div>

                  {/* Cut at End */}
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="cut-at-end" 
                      checked={cutAtEnd === 'true'} 
                      onCheckedChange={(checked) => setCutAtEnd(checked ? 'true' : 'false')}
                    />
                    <Label htmlFor="cut-at-end" className="text-xs">Cut at end (after all copies)</Label>
                  </div>

                  {/* Direct Print Settings */}
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs font-medium text-muted-foreground">Direct Network Print</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Input 
                          value={printerIp} 
                          onChange={(e) => setPrinterIp(e.target.value)}
                          placeholder="192.168.1.70"
                          className="text-xs h-7"
                        />
                      </div>
                      <div>
                        <Input 
                          value={printerPort} 
                          onChange={(e) => setPrinterPort(e.target.value)}
                          placeholder="9100"
                          className="text-xs h-7"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Save Template Button */}
                <Button 
                  onClick={handleSaveTemplate}
                  disabled={saveLoading}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Save className="h-4 w-4" />
                  {saveLoading ? 'Saving...' : 'Save Template'}
                </Button>

                {/* ZPL Format Notice */}
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-700">
                    ✅ ZPL format - Native Zebra language for precise printing
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Zebra Printer Panel */}
            <ZebraPrinterPanel />
          </div>

          {/* Center: Preview */}
          <div className="lg:col-span-1">
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <LabelPreviewCanvas 
                      ref={previewCanvasRef}
                      fieldConfig={{ ...fieldConfig, templateStyle: 'boxed' }}
                      labelData={labelData}
                      showGuides={showGuides === 'true'}
                    />
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                    <Checkbox 
                      id="show-guides" 
                      checked={showGuides === 'true'} 
                      onCheckedChange={(checked) => setShowGuides(checked ? 'true' : 'false')}
                    />
                    <Label htmlFor="show-guides" className="text-sm">Show guides</Label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Print Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Print Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Printer className="h-5 w-5" />
                  Print Control
                  {zebraConnected ? (
                    <Badge variant="default" className="ml-auto text-xs bg-green-600">
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="ml-auto text-xs">
                      Offline
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  
                  {/* Direct Network Print */}
                  <div className="p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium">Direct Network Print</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Print directly to {printerIp}:{printerPort} via TCP
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        onClick={() => handleDirectPrint(true)}
                        disabled={printLoading}
                        variant="outline"
                        size="sm"
                      >
                        {printLoading ? "Testing..." : "Test Print"}
                      </Button>
                      <Button 
                        onClick={() => handleDirectPrint(false)}
                        disabled={printLoading}
                        size="sm"
                        className={hasPrinted 
                          ? 'bg-orange-600 hover:bg-orange-700' 
                          : 'bg-primary hover:bg-primary/90'
                        }
                      >
                        {printLoading ? "Printing..." : hasPrinted ? "Print Again" : "Print"}
                      </Button>
                    </div>
                  </div>

                  {/* Zebra Printer Print */}
                  {zebraConnected && selectedPrinter && (
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-green-800">Zebra Printer Ready</span>
                      </div>
                      <p className="text-xs text-green-700 mb-3">
                        {selectedPrinter?.name || 'Zebra printer selected'}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button 
                          onClick={() => handleZebraPrint(true)}
                          disabled={printLoading}
                          variant="outline"
                          size="sm"
                        >
                          {printLoading ? "Testing..." : "Test Print"}
                        </Button>
                        <Button 
                          onClick={() => handleZebraPrint(false)}
                          disabled={printLoading}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {printLoading ? "Printing..." : "Print"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ZPL Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Print Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Format:</span>
                    <span>ZPL ({(parseFloat(labelWidthMm)/25.4).toFixed(1)}×{(parseFloat(labelHeightMm)/25.4).toFixed(1)} inch)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolution:</span>
                    <span>{zplDpi} DPI</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Speed:</span>
                    <span>{zplSpeed} IPS</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Darkness:</span>
                    <span>{zplDarkness}/30</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Copies:</span>
                    <span>{zplCopies}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cut at end:</span>
                    <span>{cutAtEnd === 'true' ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <ZebraPrinterSelectionDialog
        open={showPrinterDialog}
        onOpenChange={setShowPrinterDialog}
        onPrint={async () => {}}
        title="Select Printer for Label"
      />
    </div>
  );
}