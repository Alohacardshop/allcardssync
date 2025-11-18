import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Printer, ListOrdered, FileText, Settings, Users, Cog, Download, Filter } from "lucide-react";
import PrintLogs from "./PrintLogs";
import LabelStudio from "./admin/LabelStudio";
import PrintQueuePanel from "@/components/print-queue/PrintQueuePanel";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";
import PulledItemsFilter from "@/components/print-queue/PulledItemsFilter";
import { PrinterSettingsPanel } from "@/components/printer-settings/PrinterSettingsPanel";
import { ShopifyPullDialog } from "@/components/barcode-printing/ShopifyPullDialog";
import { useStore } from "@/contexts/StoreContext";

export default function BarcodePrinting() {
  const { assignedStore, selectedLocation } = useStore();
  const [showPullDialog, setShowPullDialog] = useState(false);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header Section - Rebuilt cleanly */}
      <div className="space-y-4 mb-6">
        {/* Title */}
        <div className="flex items-center gap-3">
          <Printer className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Barcode Printing</h1>
        </div>

        {/* Pull from Shopify Button - Always visible */}
        <Button
          onClick={() => setShowPullDialog(true)}
          disabled={!assignedStore || !selectedLocation}
          size="lg"
        >
          <Download className="h-4 w-4 mr-2" />
          Pull from Shopify
        </Button>

        {/* Warning - Always visible for now */}
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">
            {!assignedStore || !selectedLocation 
              ? "⚠️ Select a store and location to enable Shopify product pulling."
              : "✓ Store and location set. Ready to pull products."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Store: {assignedStore || 'Not set'} | Location: {selectedLocation || 'Not set'}
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Print Queue
          </TabsTrigger>
          <TabsTrigger value="filter" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter Items
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

        <TabsContent value="filter" className="mt-6">
          <PulledItemsFilter />
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
