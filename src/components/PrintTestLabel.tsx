// PrintTestLabel.tsx
import React, { useCallback, useState } from "react";
import { renderLabelV2 } from "@/lib/print/templates";
import { printQueue } from "@/lib/print/queueInstance";
import { sanitizeLabel } from "@/lib/print/sanitizeZpl";
import { oncePer } from "@/lib/print/debounce";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function PrintTestLabel() {
  const [safe, setSafe] = useState(localStorage.getItem("safePrintMode") === "true");

  const toggleSafe = useCallback(() => {
    const next = !safe;
    setSafe(next);
    localStorage.setItem("safePrintMode", String(next));
  }, [safe]);

  const handlePrint = useCallback(async () => {
    const rawZpl = renderLabelV2({
      CONDITION: "NM",
      PRICE: "$4.00",
      BARCODE: "5459953",
      CARDNAME: "SWSH09: Brilliant Stars Trainer Gallery Ariados #TG09/TG30",
    });
    
    console.debug("[print_prepare]", {
      template: "test_label",
      qty: 1,
      preview: rawZpl.slice(0, 120).replace(/\n/g, "\\n")
    });
    
    const safeZpl = sanitizeLabel(rawZpl);
    await printQueue.enqueueSafe({ zpl: safeZpl, qty: 1, usePQ: true });
  }, []);

  const onClick = useCallback(oncePer()(handlePrint), [handlePrint]);

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg">
      <Button
        onClick={onClick}
        variant="outline"
        title="Sends a single safe ZPL test label"
      >
        Print Test Label
      </Button>
      <div className="flex items-center space-x-2">
        <Switch
          id="safe-mode"
          checked={safe}
          onCheckedChange={toggleSafe}
        />
        <Label htmlFor="safe-mode">
          Safe print mode (slow/cool)
        </Label>
      </div>
    </div>
  );
}