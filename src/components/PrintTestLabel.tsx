// PrintTestLabel.tsx
import React, { useCallback, useState } from "react";
import { testLabelZpl } from "@/lib/print/templates";
import { printQueue } from "@/lib/print/queueInstance";
import { oncePer } from "@/lib/print/debounce";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function PrintTestLabel() {
  const [safe, setSafe] = useState(localStorage.getItem("safePrintMode") === "true");

  const toggleSafe = useCallback(() => {
    const next = !safe;
    setSafe(next);
    localStorage.setItem("safePrintMode", String(next));
  }, [safe]);

  const handlePrint = useCallback(async () => {
    console.debug("[test_label_print]", {
      zplLength: testLabelZpl.length,
      preview: testLabelZpl.slice(0, 50).replace(/\n/g, "\\n")
    });
    
    // Use single mode for test labels to avoid cut tail
    await printQueue.enqueueSingle({ 
      zpl: testLabelZpl, 
      qty: 1, 
      usePQ: true 
    });
    
    toast.success("Test label sent - should print exactly once");
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