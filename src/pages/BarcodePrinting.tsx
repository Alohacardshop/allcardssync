import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Printer, Filter, Users, Cog, FileText, Settings, AlertTriangle } from "lucide-react";
import PrintLogs from "./PrintLogs";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";
import PulledItemsFilter from "@/components/print-queue/PulledItemsFilter";
import PrintQueuePanel from "@/components/print-queue/PrintQueuePanel";
import { PrinterSettings } from "@/components/PrinterSettings";
import { LabelEditorEmbed } from "@/features/barcode/components/LabelEditorEmbed";
import { usePrintQueueContext } from "@/contexts/PrintQueueContext";
import { PageHeader } from "@/components/layout/PageHeader";

export default function BarcodePrinting() {
  const { getDeadLetterQueue } = usePrintQueueContext();
  const [failedJobCount, setFailedJobCount] = useState(0);

  // Poll for failed job count
  useEffect(() => {
    const updateCount = () => {
      setFailedJobCount(getDeadLetterQueue().length);
    };
    updateCount();
    const interval = setInterval(updateCount, 2000);
    return () => clearInterval(interval);
  }, [getDeadLetterQueue]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader 
        title="Barcode Printing"
        description="Pull products from Shopify, filter, and print labels"
        showEcosystem
      />

      <Tabs defaultValue="filter" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="filter" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter & Print
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Print Queue
            {failedJobCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {failedJobCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Print Profiles
          </TabsTrigger>
          <TabsTrigger value="printers" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Printer Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Label Templates
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Print Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="filter" className="mt-6">
          <PulledItemsFilter />
        </TabsContent>

        <TabsContent value="queue" className="mt-6">
          <PrintQueuePanel />
        </TabsContent>

        <TabsContent value="profiles" className="mt-6">
          <PrintProfileManager />
        </TabsContent>

        <TabsContent value="printers" className="mt-6">
          <PrinterSettings />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <LabelEditorEmbed />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <PrintLogs />
        </TabsContent>
      </Tabs>
    </div>
  );
}
