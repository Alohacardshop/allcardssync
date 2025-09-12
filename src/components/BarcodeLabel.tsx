import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PrinterSelectionDialog } from '@/components/PrinterSelectionDialog';

interface BarcodeLabelProps {
  value: string;
  label?: string;
  className?: string;
  showPrintButton?: boolean;
}

const BarcodeLabel = ({ value, label, className, showPrintButton = true }: BarcodeLabelProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);
  const [barcodeBlob, setBarcodeBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const JsBarcode: any = (await import("jsbarcode")).default;
        if (isMounted && canvasRef.current && value) {
          JsBarcode(canvasRef.current, value, {
            format: "CODE128",
            displayValue: true,
            fontSize: 14,
            lineColor: "#111827",
            margin: 8,
          });
        }
      } catch (e) {
        // no-op in case of SSR or load errors
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [value]);

  const handlePrint = async () => {
    try {
      if (!canvasRef.current) return;
      
      // Convert canvas to blob for PrintNode
      const blob = await new Promise<Blob>((resolve) => {
        canvasRef.current?.toBlob((blob) => {
          if (blob) resolve(blob);
        }, 'image/png');
      });
      
      setBarcodeBlob(blob);
      setShowPrinterDialog(true);
    } catch (error) {
      console.error('Error preparing barcode for print:', error);
    }
  };

  const handlePrintWithPrinter = async (printerId: number) => {
    if (!barcodeBlob) return;
    
    try {
      const { printNodeService } = await import('@/lib/printNodeService');
      await printNodeService.printPNG(barcodeBlob, printerId, { 
        title: `Barcode-${value}`,
        copies: 1 
      });
    } catch (error) {
      console.error('Print error:', error);
    } finally {
      setBarcodeBlob(null);
    }
  };

  const handleLegacyPrint = () => {
    try {
      if (!canvasRef.current) return;
      const dataUrl = canvasRef.current.toDataURL("image/png");

      // Create a hidden iframe to isolate print content (avoids printing full app)
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        iframe.remove();
        return;
      }

      const html = `<!doctype html><html><head><title>Print Barcode</title><style>
        @page { size: auto; margin: 6mm; }
        html, body { height: 100%; }
        body { display: flex; align-items: center; justify-content: center; }
        img { width: 320px; }
      </style></head>
      <body>
        <img src="${dataUrl}" alt="Barcode ${value}"
          onload="setTimeout(() => { window.focus(); window.print(); }, 20)" />
      </body></html>`;

      doc.open();
      doc.write(html);
      doc.close();

      const cleanup = () => setTimeout(() => iframe.remove(), 300);
      iframe.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
      // Fallback cleanup in case afterprint doesn't fire
      setTimeout(cleanup, 5000);
    } catch (e) {
      // no-op
    }
  };

  return (
    <div className={className}>
      {label && <div className="text-sm text-muted-foreground mb-1">{label}</div>}
      <canvas ref={canvasRef} role="img" aria-label={`Barcode for ${value}`} />
      {showPrintButton && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" onClick={handlePrint}>Print Label</Button>
        </div>
      )}
      
      <PrinterSelectionDialog
        open={showPrinterDialog}
        onOpenChange={setShowPrinterDialog}
        onPrint={handlePrintWithPrinter}
        title="Select Printer for Barcode"
      />
    </div>
  );
};

export default BarcodeLabel;
