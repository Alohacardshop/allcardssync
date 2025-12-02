import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Printer, ListOrdered, FileText, Settings, Users, Cog, Download, Filter, PenTool } from "lucide-react";
import PrintLogs from "./PrintLogs";
import LabelStudio from "./admin/LabelStudio";
import PrintQueuePanel from "@/components/print-queue/PrintQueuePanel";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";
import PulledItemsFilter from "@/components/print-queue/PulledItemsFilter";
import { PrinterSettings } from "@/components/PrinterSettings";
import { ShopifyPullDialog } from "@/components/barcode-printing/ShopifyPullDialog";
import { useStore } from "@/contexts/StoreContext";

export default function BarcodePrinting() {
  const { assignedStore, selectedLocation } = useStore();
  const [showPullDialog, setShowPullDialog] = useState(false);
  const navigate = useNavigate();

  const handleOpenShopifyDialog = () => {
    setShowPullDialog(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <section className="mt-20 mb-6 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            Shopify import
          </h2>

          <Button
            size="lg"
            onClick={handleOpenShopifyDialog}
            disabled={!assignedStore || !selectedLocation}
          >
            Pull from Shopify
          </Button>
        </div>

        {(!assignedStore || !selectedLocation) ? (
          <p className="text-sm text-muted-foreground">
            Select a store and location in the top bar before pulling products from Shopify.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Store and location set. You can now pull products from Shopify.
          </p>
        )}
      </section>

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
          <PrinterSettings />
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <PrintLogs />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <div className="mb-4">
            <Button onClick={() => navigate('/barcode/label-editor')} variant="outline">
              <PenTool className="w-4 h-4 mr-2" />
              Open Visual Label Editor
            </Button>
          </div>
          <LabelStudio />
        </TabsContent>
      </Tabs>

      {assignedStore && selectedLocation && (
        <ShopifyPullDialog
          open={showPullDialog}
          onOpenChange={setShowPullDialog}
          storeKey={assignedStore}
          locationGid={selectedLocation}
          onSuccess={() => setShowPullDialog(false)}
        />
      )}
    </div>
  );
}
