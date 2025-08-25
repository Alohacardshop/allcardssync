// src/components/PDFLabelPreview.tsx
import React, { useEffect, useState } from "react";
import { generateLabelPDF } from "@/lib/labelRenderer";
import { buildLabelDataFromItem, CardItem } from "@/lib/labelData";
import { getLabelDesignerSettings } from "@/lib/labelDesignerSettings";

function base64ToUint8Array(base64: string): Uint8Array {
  if (base64.startsWith("data:")) base64 = base64.split(",")[1] || "";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function ensureUint8Array(pdfOut: unknown): Uint8Array {
  if (pdfOut instanceof Uint8Array) return pdfOut;
  if (pdfOut instanceof ArrayBuffer) return new Uint8Array(pdfOut);
  if (typeof pdfOut === "string") return base64ToUint8Array(pdfOut);
  throw new Error("Unsupported PDF data type from generateLabelPDF");
}

const PDFLabelPreview: React.FC<{ item: CardItem }> = ({ item }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Build the exact same data as print
        const { fieldConfig } = getLabelDesignerSettings();
        const labelData = buildLabelDataFromItem(item);
        const pdfBase64 = await generateLabelPDF(fieldConfig, labelData);
        const bytes = ensureUint8Array(pdfBase64);

        if (!mounted) return;

        // Create blob and trigger download
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        
        // Create invisible download link and trigger it
        const link = document.createElement('a');
        link.href = url;
        link.download = `label-${labelData.sku || 'preview'}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL
        URL.revokeObjectURL(url);
        
        if (mounted) {
          setDownloaded(true);
        }
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || "Failed to create preview PDF");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [item]);

  const downloadAgain = async () => {
    try {
      const { fieldConfig } = getLabelDesignerSettings();
      const labelData = buildLabelDataFromItem(item);
      const pdfBase64 = await generateLabelPDF(fieldConfig, labelData);
      const bytes = ensureUint8Array(pdfBase64);

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `label-${labelData.sku || 'preview'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  if (loading) {
    return (
      <div className="w-80 h-40 bg-muted flex items-center justify-center border rounded text-sm">
        Generating PDF download…
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-80 h-40 bg-muted flex items-center justify-center border rounded text-xs text-destructive">
        {error}
      </div>
    );
  }

  if (downloaded) {
    return (
      <div className="w-80 h-40 bg-muted flex flex-col items-center justify-center border rounded gap-2">
        <div className="text-sm text-muted-foreground text-center">
          ✓ PDF downloaded successfully
        </div>
        <div className="text-xs text-muted-foreground text-center">
          Check your Downloads folder
        </div>
        <button
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90"
          onClick={downloadAgain}
        >
          Download again
        </button>
      </div>
    );
  }

  return null;
};

export default PDFLabelPreview;