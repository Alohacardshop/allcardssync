import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Link, useLocation } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { PrinterPanel } from "@/components/PrinterPanel";
import { usePrintNode } from "@/hooks/usePrintNode";
import { useLocalStorageString } from "@/hooks/useLocalStorage";
import { generateBoxedLayoutTSPL, type LabelFieldConfig } from "@/lib/tspl";
import { LabelPreviewCanvas } from "@/components/LabelPreviewCanvas";
import { Settings, Eye, Printer, ChevronDown, Home, Save } from "lucide-react";
import jsPDF from "jspdf";
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
    title: "Label Designer 2x1 in | Aloha", 
    description: "Design and print 2x1 inch labels with barcode, lot, SKU, price, and more using TSPL for Rollo printers." 
  });

  const location = useLocation();
  const { printPDF, isConnected: printNodeConnected, selectedPrinterId, selectedPrinter } = usePrintNode();
  const [printLoading, setPrintLoading] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  // Raw templates for Label Designer persistence
  const { templates: rawTemplates, defaultTemplate, saveTemplate, setAsDefault, loading: templatesLoading } = useRawTemplates();

  // PDF is the only print format now
  const printFormat = 'pdf';
  
  // Ref for accessing canvas export function
  const previewCanvasRef = useRef<any>(null);

  // TSPL settings are no longer used for PDF printing
  const tsplSettings = { density: 10, speed: 4, gapInches: 0 };

  // Field configuration with localStorage persistence
  const [includeTitle, setIncludeTitle] = useLocalStorageString('field-title', 'true');
  const [includeSku, setIncludeSku] = useLocalStorageString('field-sku', 'true');
  const [includePrice, setIncludePrice] = useLocalStorageString('field-price', 'true');
  const [includeLot, setIncludeLot] = useLocalStorageString('field-lot', 'true');
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
  
  // Preview TSPL
  const [previewTspl, setPreviewTspl] = useState("");

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

  // tsplSettings already defined above

  // Update preview when data or config changes
  useEffect(() => {
    try {
      // Always use boxed layout
      const tspl = generateBoxedLayoutTSPL(labelData, fieldConfig, tsplSettings);
      setPreviewTspl(tspl);
    } catch (error) {
      console.error('Failed to generate TSPL preview:', error);
      setPreviewTspl('// Error generating preview');
    }
  }, [labelData, fieldConfig, tsplSettings]);

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
        'Optimized Barcode Template',
        fieldConfig,
        labelData,
        tsplSettings,
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

  // Generate PDF from canvas
  const generatePDFFromCanvas = async (testData?: any, testConfig?: any): Promise<string> => {
    try {
      const canvas = previewCanvasRef.current;
      if (!canvas || !canvas.exportToPNG) {
        throw new Error('Canvas export function not available');
      }

      // Get high-DPI PNG from canvas
      const pngBlob = await canvas.exportToPNG(203); // 203 DPI for thermal printing
      
      // Convert blob to data URL for jsPDF
      const pngDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(pngBlob);
      });

      // Create PDF with exact 2x1 inch dimensions
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'in',
        format: [2, 1] // 2x1 inches
      });

      // Add the image to fill the entire PDF
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, 2, 1);
      
      return pdf.output('datauristring').split(',')[1]; // Return base64 part only
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw error;
    }
  };

  // PrintNode printing function with format selection
  const handlePrintNodePrint = async (isTest = false) => {
    if (!selectedPrinterId) {
      toast.error('Select a PrintNode printer first');
      return;
    }

    setPrintLoading(true);
    try {
      const testData = isTest ? {
        title: "TEST LABEL",
        sku: "TEST-001", 
        price: "99.99",
        lot: "TEST-LOT",
        condition: "Test",
        barcode: "123456789"
      } : labelData;

      const testConfig = isTest ? {
        includeTitle: true,
        includeSku: true,
        includePrice: true,
        includeLot: true,
        includeCondition: true,
        barcodeMode: 'qr' as const
      } : fieldConfig;

      let result;
      const jobTitle = isTest ? 'Test Label' : 'Label Print';

      // PDF printing from canvas
      const pdfBase64 = await generatePDFFromCanvas(testData, testConfig);
      result = await printPDF(pdfBase64, {
        title: jobTitle,
        copies: 1
      });

      if (result?.success) {
        setHasPrinted(true);
        toast.success(`${isTest ? 'Test' : 'Label'} sent to printer successfully (Job ID: ${result.jobId})`);
      } else {
        throw new Error(result?.error || 'Print failed');
      }
      
    } catch (e) {
      console.error("PrintNode print failed:", e);
      toast.error(`PrintNode print failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setPrintLoading(false);
    }
  };

  // Test print the actual preview layout
  const handleTestPrintLayout = async () => {
    if (!selectedPrinterId) {
      toast.error('Select a PrintNode printer first');
      return;
    }

    setPrintLoading(true);
    try {
      let result;
      const timestamp = new Date().toLocaleTimeString();
      
      if (!previewCanvasRef.current?.exportToPDF) {
        toast.error('PDF export not available');
        return;
      }
      
      const pdfBase64 = await previewCanvasRef.current.exportToPDF();
      result = await printPDF(pdfBase64, {
        title: `Layout Test PDF - ${timestamp}`,
        copies: 1
      });

      if (result.success) {
        toast.success(`Layout test sent to printer - Job ID: ${result.jobId}`);
      } else {
        throw new Error(result.error || 'Print failed');
      }
      
    } catch (e) {
      console.error("Layout test print failed:", e);
      toast.error(`Layout test failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
            <h1 className="text-2xl font-bold text-foreground">Label Designer</h1>
            <p className="text-muted-foreground mt-1">Design and print 2x1 inch labels with barcode, lot, SKU, price, and more.</p>
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

                {/* Note: PDF printing only */}
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-xs text-blue-700">
                    🔵 PDF printing only - Settings automatically optimized for Rollo printers
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Printer Panel */}
            <PrinterPanel />
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

          {/* Right: Print & Code */}
          <div className="lg:col-span-1 space-y-4">
            {/* Print Controls */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Printer className="h-5 w-5" />
                  Print Control
                  {printNodeConnected ? (
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
                {printNodeConnected && selectedPrinterId ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <span className="text-sm font-medium text-green-800">Printer Ready</span>
                      </div>
                      <p className="text-xs text-green-700">
                        {selectedPrinter?.name || 'PrintNode printer selected'}
                      </p>
                    </div>

                    {/* PDF Only Notice */}
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        <span className="text-sm font-medium text-blue-800">PDF Format Only</span>
                      </div>
                      <p className="text-xs text-blue-700">
                        Optimized for Rollo thermal printers with scannable Code128 barcodes
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Button 
                        onClick={() => handlePrintNodePrint(true)}
                        disabled={printLoading}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {printLoading ? "Testing..." : "Test Print"}
                      </Button>
                      <Button 
                        onClick={handleTestPrintLayout}
                        disabled={printLoading}
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                      >
                        <Printer className="h-3 w-3" />
                        {printLoading ? "Testing..." : "Test Print Layout"}
                      </Button>
                      <Button 
                        onClick={() => handlePrintNodePrint(false)}
                        disabled={printLoading}
                        size="sm"
                        className={`w-full ${
                          hasPrinted 
                            ? 'bg-orange-600 hover:bg-orange-700' 
                            : 'bg-primary hover:bg-primary/90'
                        }`}
                      >
                        {printLoading ? "Printing..." : hasPrinted ? "Print Again" : "Print Label"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="text-sm font-medium text-red-800">Printer Offline</span>
                    </div>
                    <p className="text-xs text-red-700">
                      {!printNodeConnected ? 
                        "Configure PrintNode connection" :
                        "Select a printer below"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* PDF Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Print Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Format:</span>
                    <span>PDF (2×1 inch)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Barcode:</span>
                    <span>Code128 (scannable)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resolution:</span>
                    <span>203 DPI</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Printer:</span>
                    <span>Thermal (Rollo optimized)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}