import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Filter, Users, Cog, FileText, Settings } from "lucide-react";
import PrintLogs from "./PrintLogs";
import PrintProfileManager from "@/components/print-queue/PrintProfileManager";
import PulledItemsFilter from "@/components/print-queue/PulledItemsFilter";
import { PrinterSettings } from "@/components/PrinterSettings";
import { LabelEditorEmbed } from "@/features/barcode/components/LabelEditorEmbed";

export default function BarcodePrinting() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <section className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Printer className="h-6 w-6" />
          Barcode Printing
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pull products from Shopify, filter, and print labels
        </p>
      </section>

      <Tabs defaultValue="filter" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="filter" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter & Print
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
