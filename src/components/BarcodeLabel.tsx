import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZebraPrinterSelectionDialog } from '@/components/ZebraPrinterSelectionDialog';
import { print } from '@/lib/printService';

interface BarcodeLabelProps {
  value: string;
  label?: string;
  className?: string;
  showPrintButton?: boolean;
}

const BarcodeLabel = ({ value, label, className, showPrintButton = true }: BarcodeLabelProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showPrinterDialog, setShowPrinterDialog] = useState(false);

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
    setShowPrinterDialog(true);
  };

  const handlePrintWithPrinter = async (printer: any) => {
    if (!value) return;
    
    try {
      console.log('🖨️ Printing barcode label via unified print service');
      
      const zpl = `^XA
^MTD
^MNY
^PW448
^LL203
^LH0,0
^LS16
^FWN
^PON
^CI28
^FO50,30^A0N,30,30^FD${label || 'Barcode'}^FS
^FO50,80^BCN,80,Y,N,N^FD${value}^FS
^PQ1,1,0,Y
^XZ`;

      const result = await print(zpl, 1);

      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      throw error;
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
      
      <ZebraPrinterSelectionDialog
        open={showPrinterDialog}
        onOpenChange={setShowPrinterDialog}
        onPrint={handlePrintWithPrinter}
        title="Select Printer for Barcode"
      />
    </div>
  );
};

export default BarcodeLabel;
