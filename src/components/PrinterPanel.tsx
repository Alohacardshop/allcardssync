import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Printer, Cloud, WifiOff, TestTube, FileText, Edit2, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { printNodeService } from "@/lib/printNodeService";
import { supabase } from "@/integrations/supabase/client";
import { usePrinterNames } from "@/hooks/usePrinterNames";
import jsPDF from 'jspdf';

interface PrintNodePrinter {
  id: number;
  name: string;
}

export function PrinterPanel() {
  const [workstationId, setWorkstationId] = useState<string>('');
  
  // Get or create consistent workstation ID (same logic as usePrintNode)
  const getWorkstationId = () => {
    let id = localStorage.getItem('workstation-id');
    if (!id) {
      id = crypto.randomUUID().substring(0, 8);
      localStorage.setItem('workstation-id', id);
    }
    return id;
  };
  const [printers, setPrinters] = useState<PrintNodePrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<PrintNodePrinter | null>(null);
  const [printNodeOnline, setPrintNodeOnline] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [testPrinting, setTestPrinting] = useState<boolean>(false);
  const [testingPDF, setTestingPDF] = useState<boolean>(false);
  const [keySource, setKeySource] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string>('');
  const [editingPrinterId, setEditingPrinterId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  
  const { getDisplayName, setCustomName, resetName, hasCustomName } = usePrinterNames();

  useEffect(() => {
    loadPrinterSettings();
    // Immediately check PrintNode status on mount
    refreshPrinters();
  }, []);

  const loadPrinterSettings = async () => {
    try {
      const id = getWorkstationId();
      setWorkstationId(id);
      
      const { data: settings } = await supabase
        .from('printer_settings')
        .select('*')
        .eq('workstation_id', id)
        .order('updated_at', { ascending: false })
        .maybeSingle();
        
      if (settings && settings.selected_printer_id && settings.selected_printer_name) {
        setSelectedPrinter({
          id: settings.selected_printer_id,
          name: settings.selected_printer_name
        });
      }
    } catch (error) {
      console.error('Failed to load printer settings:', error);
    }
  };

  const savePrinterSettings = async () => {
    if (!selectedPrinter) return;
    
    try {
      await supabase
        .from('printer_settings')
        .upsert({
          workstation_id: workstationId,
          selected_printer_id: selectedPrinter.id,
          selected_printer_name: selectedPrinter.name,
          use_printnode: true,
        }, {
          onConflict: 'workstation_id'
        });
      
      // Also sync to localStorage for consistency with usePrintNode hook
      localStorage.setItem('printnode-selected-printer', selectedPrinter.id.toString());
        
      toast.success(`Default printer set to ${getDisplayName(selectedPrinter.id, selectedPrinter.name)}`);
    } catch (error) {
      console.error('Failed to save printer settings:', error);
      toast.error("Failed to save settings");
    }
  };

  const refreshPrinters = async () => {
    setLoading(true);
    setConnectionError('');
    try {
      const printerList = await printNodeService.getPrinters();
      const formattedPrinters = printerList.map(p => ({id: p.id, name: p.name}));
      setPrinters(formattedPrinters);
      setPrintNodeOnline(true);
      setLastChecked(new Date());
      
      // Try to get key source info from the service initialization
      try {
        await printNodeService.initialize();
        // This will log which key source is being used
      } catch (initError) {
        console.log('Key source detection failed:', initError);
      }
      
      toast.success(`Found ${formattedPrinters.length} printer(s)`);
    } catch (error) {
      setPrintNodeOnline(false);
      setPrinters([]);
      setLastChecked(new Date());
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to PrintNode";
      setConnectionError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const generateTestPDF = (): string => {
    const doc = new jsPDF({
      unit: 'in',
      format: [2.0, 1.0], // Exact 2.0" x 1.0" 
      orientation: 'landscape',
      putOnlyUsedFonts: true,
      compress: false
    });

    // Set PDF metadata for single label
    doc.setProperties({
      title: 'Single Label Print',
      subject: 'Test Label',
      creator: 'Label Designer'
    });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text('2x1" TEST', 0.1, 0.3);
    doc.setFontSize(10);
    doc.text('Rollo Label', 0.1, 0.5);
    doc.setFontSize(8);
    doc.text(`${new Date().toLocaleTimeString()}`, 0.1, 0.7);

    return doc.output('datauristring').split(',')[1];
  };

  const runPDFTest = async () => {
    if (!selectedPrinter) {
      toast.error("No printer selected");
      return;
    }

    setTestingPDF(true);
    try {
      const pdfBase64 = generateTestPDF();
      const result = await printNodeService.printPDF(
        pdfBase64,
        selectedPrinter.id,
        { title: `PDF Test - ${new Date().toLocaleTimeString()}`, copies: 1 }
      );

      if (result.success) {
        toast.success(`PDF Test Sent - Job ID: ${result.jobId}`);
      } else {
        throw new Error(result.error || 'PDF print failed');
      }
    } catch (error) {
      console.error('PDF test error:', error);
      toast.error(error instanceof Error ? error.message : "PDF test failed");
    } finally {
      setTestingPDF(false);
    }
  };

  const runSmokeTest = async () => {
    if (!selectedPrinter) {
      toast.error("No printer selected");
      return;
    }

    setTestPrinting(true);
    
    try {
      // Create print job record
      const { data: printJob } = await supabase
        .from('print_jobs')
        .insert({
          workstation_id: workstationId,
          target: {
            printer_name: selectedPrinter.name,
            printer_id: selectedPrinter.id,
            type: 'printnode'
          },
          data: {
            test_print: true,
            timestamp: new Date().toISOString()
          },
          status: 'queued'
        })
        .select()
        .single();

      if (!printJob) throw new Error('Failed to create print job record');

      // Generate and send PDF
      const pdfBase64 = generateTestPDF();
      const result = await printNodeService.printPDF(
        pdfBase64,
        selectedPrinter.id,
        { title: `Test Print - ${new Date().toLocaleTimeString()}` }
      );

      if (result.success) {
        // Update print job with PrintNode job ID
        await supabase
          .from('print_jobs')
          .update({
            status: 'sent',
            data: {
              ...(printJob.data as Record<string, any>),
              printnode_job_id: result.jobId
            }
          })
          .eq('id', printJob.id);

        toast.success(`PDF Test Sent - Job ID: ${result.jobId}`);
      } else {
        throw new Error(result.error || 'Print failed');
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Smoke test failed';
      toast.error(errorMsg);
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          PrintNode Cloud Printing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PrintNode Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">PrintNode Status:</span>
          <Badge variant={printNodeOnline ? "default" : "destructive"} className="gap-1">
            {printNodeOnline ? <Cloud className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {printNodeOnline ? "Connected" : "Not Connected"}
          </Badge>
        </div>

        {!printNodeOnline && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
              <WifiOff className="h-4 w-4" />
              PrintNode Not Available
            </div>
            <p className="text-sm text-muted-foreground">
              {connectionError || "Check your PrintNode API key configuration in Supabase secrets."}
            </p>
          </div>
        )}

        {/* API Key Source Indicator */}
        {printNodeOnline && keySource && (
          <div className="p-2 bg-green-50 border border-green-200 rounded-md">
            <p className="text-xs text-green-700">
              Using {keySource} API key
            </p>
          </div>
        )}

        {/* Workstation ID */}
        <div className="text-xs text-muted-foreground">
          Workstation: {workstationId}
        </div>

         {/* Printer Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Printers:</label>
            {selectedPrinter && (
              <Badge variant="secondary" className="text-xs">
                Default: {getDisplayName(selectedPrinter.id, selectedPrinter.name)}
              </Badge>
            )}
          </div>
          
          {/* Available Printers List */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {printers.map((printer) => (
              <div key={printer.id} className="flex items-center gap-2 p-2 border rounded-md">
                <input
                  type="radio"
                  id={`printer-${printer.id}`}
                  name="selectedPrinter"
                  checked={selectedPrinter?.id === printer.id}
                  onChange={() => setSelectedPrinter(printer)}
                  className="h-4 w-4"
                />
                
                <div className="flex-1 min-w-0">
                  {editingPrinterId === printer.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setCustomName(printer.id, editingName);
                            setEditingPrinterId(null);
                            toast.success('Printer name updated');
                          } else if (e.key === 'Escape') {
                            setEditingPrinterId(null);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setCustomName(printer.id, editingName);
                          setEditingPrinterId(null);
                          toast.success('Printer name updated');
                        }}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingPrinterId(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <label 
                          htmlFor={`printer-${printer.id}`}
                          className="font-medium text-sm cursor-pointer"
                        >
                          {getDisplayName(printer.id, printer.name)}
                        </label>
                        {hasCustomName(printer.id) && (
                          <div className="text-xs text-muted-foreground">
                            Original: {printer.name}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditingPrinterId(printer.id);
                            setEditingName(getDisplayName(printer.id, printer.name));
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        {hasCustomName(printer.id) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            onClick={() => {
                              resetName(printer.id);
                              toast.success('Printer name reset');
                            }}
                            title="Reset to original name"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {printers.length === 0 && printNodeOnline && (
              <div className="text-sm text-muted-foreground text-center py-4">
                No printers found
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshPrinters}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Checking..." : "Refresh"}
            </Button>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={savePrinterSettings}
              disabled={!selectedPrinter}
            >
              Set as Default
            </Button>
          </div>
          
          {lastChecked && (
            <div className="text-xs text-muted-foreground">
              Last checked: {lastChecked.toLocaleTimeString()}
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Test Printing */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Test Printing:</label>
          
          <Button 
            variant="outline"
            size="sm"
            onClick={runPDFTest} 
            disabled={!printNodeOnline || !selectedPrinter || testingPDF}
            className="w-full"
          >
            <FileText className="w-4 h-4 mr-2" />
            {testingPDF ? "Testing..." : "Quick PDF Test"}
          </Button>

          <Button 
            className="w-full gap-2" 
            onClick={runSmokeTest}
            disabled={!printNodeOnline || !selectedPrinter || testPrinting}
          >
            <TestTube className="h-4 w-4" />
            {testPrinting ? "Testing..." : "Full Test Print"}
          </Button>
        </div>

        {/* PrintNode Info */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          Optimized for Rollo label printers using PDF format.
          <br />
          {printers.length > 0 && `${printers.length} printer(s) available`}
        </div>
      </CardContent>
    </Card>
  );
}
