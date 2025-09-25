// PrintTestLabel.tsx
import React, { useCallback, useState } from "react";
import { renderLabelV2 } from "@/lib/print/templates";
import { printQueue } from "@/lib/print/queueInstance";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

function debounce<T extends (...args: any[]) => any>(fn: T, wait = 500) {
  let timer: any;
  return (...args: Parameters<T>) => {
    if (timer) return;
    fn(...args);
    timer = setTimeout(() => { timer = null; }, wait);
  };
}

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
    const safeZpl = rawZpl.replace(/\^XZ\s*$/, "").concat("\n^PQ1\n^XZ");
    printQueue.enqueue({ zpl: safeZpl, qty: 1, usePQ: true });
  }, []);

  const onClick = useCallback(debounce(handlePrint, 500), [handlePrint]);

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