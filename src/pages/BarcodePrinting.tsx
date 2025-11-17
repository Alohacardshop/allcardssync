import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, ListOrdered, FileText, Settings, Users } from "lucide-react";
import PrintLogs from "./PrintLogs";
import LabelStudio from "./admin/LabelStudio";
import PrintQueuePanel from "@/components/print-queue/PrintQueuePanel";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";

export default function BarcodePrinting() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Printer className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold">Barcode Printing</h1>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Print Queue
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Print Profiles
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Print Logs
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Label Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-6">
          <PrintQueuePanel />
        </TabsContent>

        <TabsContent value="profiles" className="mt-6">
          <PrintProfileManager />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <PrintLogs />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <LabelStudio />
        </TabsContent>
      </Tabs>
    </div>
  );
}
