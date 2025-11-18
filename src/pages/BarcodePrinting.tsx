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

  // Debug logging - CRITICAL for diagnosis
  console.log('[BarcodePrinting] ========== COMPONENT RENDERING ==========');
  console.log('[BarcodePrinting] Component mounted/rendering');
  console.log('[BarcodePrinting] assignedStore:', assignedStore);
  console.log('[BarcodePrinting] selectedLocation:', selectedLocation);
  console.log('[BarcodePrinting] About to render header section...');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* DEBUG HEADER - Super obvious, should ALWAYS be visible */}
      <div style={{ 
        border: '3px solid red', 
        padding: '20px', 
        marginBottom: '20px',
        backgroundColor: '#ffe0e0'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>
          ✅ Barcode Printing (DEBUG HEADER - IF YOU SEE THIS, RENDERING WORKS)
        </h1>
        
        <button
          style={{ 
            padding: '12px 24px', 
            fontSize: '16px', 
            marginTop: '12px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          onClick={() => {
            console.log('🔥 TEST BUTTON CLICKED - Button is rendering and clickable!');
            alert('Test button works! Button rendering is OK.');
          }}
        >
          🔥 TEST BUTTON - CLICK ME TO CONFIRM VISIBILITY
        </button>
        
        <div style={{ 
          marginTop: '12px', 
          padding: '10px',
          backgroundColor: '#fff3cd',
          border: '2px solid orange',
          color: '#856404'
        }}>
          ⚠️ TEST WARNING - IF YOU SEE THIS, WARNING RENDERING WORKS
        </div>
        
        <div style={{ marginTop: '12px', fontSize: '14px', color: '#666' }}>
          Store: {assignedStore || 'NOT SET'} | Location: {selectedLocation || 'NOT SET'}
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
