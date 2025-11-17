import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Printer, ListOrdered, FileText, Settings, Users, Cog, Download } from "lucide-react";
import PrintLogs from "./PrintLogs";
import LabelStudio from "./admin/LabelStudio";
import PrintQueuePanel from "@/components/print-queue/PrintQueuePanel";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";
import { PrinterSettingsPanel } from "@/components/printer-settings/PrinterSettingsPanel";
import { ShopifyPullDialog } from "@/components/barcode-printing/ShopifyPullDialog";
import { useStore } from "@/contexts/StoreContext";

export default function BarcodePrinting() {
  const { assignedStore, selectedLocation } = useStore();
  const [showPullDialog, setShowPullDialog] = useState(false);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Printer className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Barcode Printing</h1>
        </div>
        
        <Button
          onClick={() => setShowPullDialog(true)}
          disabled={!assignedStore || !selectedLocation}
        >
          <Download className="mr-2 h-4 w-4" />
          Pull from Shopify
        </Button>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Print Queue
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Print Profiles
          </TabsTrigger>
          <TabsTrigger value="printers" className="flex items-center gap-2">
            <Cog className="h-4 w-4" />
            Printer Settings
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

        <TabsContent value="printers" className="mt-6">
          <PrinterSettingsPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <PrintLogs />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <LabelStudio />
        </TabsContent>
      </Tabs>

      {assignedStore && selectedLocation && (
        <ShopifyPullDialog
          open={showPullDialog}
          onOpenChange={setShowPullDialog}
          storeKey={assignedStore}
          locationGid={selectedLocation}
          onSuccess={() => {
            console.log("Products pulled successfully");
          }}
        />
      )}
    </div>
  );
}
