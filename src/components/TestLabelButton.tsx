import React, { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { printQueue } from "@/lib/print/queueInstance";
import { testLabelZpl } from "@/lib/print/templates";
import { oncePer } from "@/lib/print/debounce";
import { TestTube } from "lucide-react";
import { toast } from "sonner";

export function TestLabelButton() {
  const handleTestPrint = useCallback(async () => {
    console.debug("[test_label_print]", {
      zplLength: testLabelZpl.length,
      preview: testLabelZpl.slice(0, 50).replace(/\n/g, "\\n")
    });
    
    // Send raw test ZPL without any modifications
    await printQueue.enqueueSafe({ 
      zpl: testLabelZpl, 
      qty: 1, 
      usePQ: true 
    });
    
    toast.success("Test label sent to printer");
  }, []);

  const onClick = useCallback(oncePer()(handleTestPrint), [handleTestPrint]);

  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
      className="gap-2"
      title="Print a single test label to verify no extra blanks"
    >
      <TestTube className="h-4 w-4" />
      Test Label
    </Button>
  );
}