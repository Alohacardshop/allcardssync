import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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

  // Unified print function supporting both 203 and 300 DPI
  const printBarcodeLabelUnified = async (opts: {
    sku: string;
    title: string;
    priceDisplay: string;
    condition: string;
    dpi: 203 | 300;
    copies?: number;
  }) => {
    const { sku, title, priceDisplay, condition, dpi, copies = 1 } = opts;

    const dims = dpi === 300 ? LABEL_2x1_300 : LABEL_2x1_203;

    const labelConfig: ZPLLabel = {
      width: dims.width,
      height: dims.height,
      dpi: dims.dpi,
      elements: [
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
        {
          id: 'barcode',
          type: 'barcode',
          position: { x: 50, y: 60 },
          data: sku,
          size: { width: 300, height: 40 },
          barcodeType: 'CODE128',
          height: 40,
          humanReadable: false
        },
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

    const zpl = generateZPLFromElements(labelConfig, 0, 0);
    const config = await getDirectPrinterConfig();
    if (!config) {
      toast.error('No printer configured. Go to Settings to configure printer.');
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

  // Thirds template print function
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
        throw new Error('No printer configured. Go to Settings to configure printer.');
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
        dpi: 203,
        copies
      });
    } catch (error) {
      logger.error('Print error', error instanceof Error ? error : new Error(String(error)), undefined, 'barcode-label');
      toast.error('Print failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const handlePrint = async () => {
    if (!value) return;
    
    const labelData = {
      title: label || 'Barcode',
      sku: value,
      price: null
    };
    
    await printLabel(labelData, 1);
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
    </div>
  );
};

export default BarcodeLabel;

// Export the thirds print function for use elsewhere
export { zplPriceBarcodeThirds2x1 } from '@/lib/templates/priceBarcodeThirds2x1';
