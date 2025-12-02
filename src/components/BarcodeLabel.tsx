import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ZebraPrinterSelectionDialog } from '@/components/ZebraPrinterSelectionDialog';
import { zebraNetworkService } from '@/lib/zebraNetworkService';
import { getDirectPrinterConfig } from '@/hooks/usePrinter';
import { ZPLLabel, generateZPLFromElements, LABEL_2x1_203, LABEL_2x1_300 } from '@/lib/zplElements';
import { zplPriceBarcodeThirds2x1 } from '@/lib/templates/priceBarcodeThirds2x1';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

interface BarcodeLabelProps {
  value: string;
  label?: string;
  className?: string;
  showPrintButton?: boolean;
  quantity?: number;
}

const BarcodeLabel = ({ value, label, className, showPrintButton = true, quantity = 1 }: BarcodeLabelProps) => {
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

  // Unified print function supporting both 203 and 300 DPI
  const printBarcodeLabelUnified = async (opts: {
    sku: string;
    title: string;
    priceDisplay: string; // e.g. "$24.99"
    condition: string;    // e.g. "NM"
    dpi: 203 | 300;
    copies?: number;
  }) => {
    const { sku, title, priceDisplay, condition, dpi, copies = 1 } = opts;

    const dims = dpi === 300 ? LABEL_2x1_300 : LABEL_2x1_203;

    const label: ZPLLabel = {
      width: dims.width,
      height: dims.height,
      dpi: dims.dpi,
      elements: [
        // Condition (top-left)
        {
          id: 'condition',
          type: 'text',
          position: { x: 20, y: 20 },
          font: '0',
          rotation: 0,
          fontSize: 24,
          fontWidth: 24,
          text: condition
        },
        // Price (top-right-ish; keep some margin)
        {
          id: 'price',
          type: 'text',
          position: { x: dpi === 300 ? 420 : 300, y: 20 },
          font: '0',
          rotation: 0,
          fontSize: 28,
          fontWidth: 28,
          text: priceDisplay
        },
        // Barcode (center area)
        {
          id: 'barcode',
          type: 'barcode',
          position: { x: 50, y: 60 },
          data: sku,
          size: { width: 300, height: 40 }, // width is informational here; height is enforced below
          barcodeType: 'CODE128',
          height: 40,
          humanReadable: false
        },
        // Title (bottom line)
        {
          id: 'title',
          type: 'text',
          position: { x: 20, y: 140 },
          font: '0',
          rotation: 0,
          fontSize: 18,
          fontWidth: 18,
          text: title
        }
      ]
    };

    const zpl = generateZPLFromElements(label, 0, 0);
    const config = await getDirectPrinterConfig();
    if (!config) {
      toast.error('No printer configured');
      return;
    }
    const result = await zebraNetworkService.printZPLDirect(zpl, config.ip, config.port);

    if (result.success) {
      toast.success('Barcode label printed!', {
        description: `Sent to ${config.ip} @ ${dpi} DPI`
      });
    } else {
      toast.error('Print failed', {
        description: result.error || 'Unknown error occurred'
      });
    }
  };

  // New code-only thirds template print function
  const printThirdsPriceLabel = async (opts: {
    condition: string;
    priceDisplay: string;
    sku: string;
    title: string;
    dpi: 203 | 300;
    copies?: number;
  }) => {
    try {
      const zpl = zplPriceBarcodeThirds2x1({
        ...opts,
        darkness: 10,
        speedIps: 4,
        copies: opts.copies ?? 1
      });
      const config = await getDirectPrinterConfig();
      if (!config) {
        throw new Error('No printer configured');
      }
      const res = await zebraNetworkService.printZPLDirect(zpl, config.ip, config.port);
      
      if (res?.success) {
        toast.success('Thirds label printed!', {
          description: `Sent to ${config.ip} @ ${opts.dpi} DPI`
        });
      } else {
        throw new Error(res?.error || 'Failed to print');
      }
    } catch (error) {
      logger.error('Print thirds label error', error instanceof Error ? error : new Error(String(error)), undefined, 'barcode-label');
      toast.error('Print failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const printLabel = async (labelData: any, copies: number = quantity) => {
    try {
      logger.info('BarcodeLabel: Printing with unified ZPL builder', undefined, 'barcode-label');
      
      await printBarcodeLabelUnified({
        sku: labelData.sku || '1234567890',
        title: labelData.title || 'Sample Item',
        priceDisplay: labelData.price ? `$${labelData.price}` : '$0.00',
        condition: 'NM',
        dpi: 203, // Default to 203 DPI for compatibility
        copies
      });
    } catch (error) {
      logger.error('Print error', error instanceof Error ? error : new Error(String(error)), undefined, 'barcode-label');
      toast.error('Print failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handlePrintWithPrinter = async (printer: any) => {
    if (!value) return;
    
    const labelData = {
      title: label || 'Barcode',
      sku: value,
      price: null
    };
    
    await printLabel(labelData, 1);
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
        <div className="mt-3 space-y-2">
          <Button size="sm" variant="secondary" onClick={handlePrint}>Print Label</Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => printThirdsPriceLabel({
              condition: 'NM',
              priceDisplay: '$24.99',
              sku: value,
              title: `${label || 'Barcode'} • Sample Set • #001`,
              dpi: 203,
              copies: 1
            })}
          >
            Print Thirds (2×1)
          </Button>
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

// Export the thirds print function for use elsewhere
export { zplPriceBarcodeThirds2x1 } from '@/lib/templates/priceBarcodeThirds2x1';