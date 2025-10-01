import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Lock, Package, Layers } from 'lucide-react';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { TCGPlayerBulkImport } from '@/components/TCGPlayerBulkImport';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';
import PrintTestLabel from '@/components/PrintTestLabel';
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [activeTab, setActiveTab] = useState('graded');
  const [batchCount, setBatchCount] = useState(0);

  // Listen for batch updates
  useEffect(() => {
    const handleBatchItemAdded = () => {
      toast({
        title: "Success",
        description: "Item added to batch!"
      });
    };

    window.addEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
    return () => {
      window.removeEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
    };
  }, []);

  // Handle batch add callback
  const handleBatchAdd = () => {
    toast({
      title: "Success", 
      description: "Item added to batch!"
    });
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto p-4">
        {/* PRINT TEST SECTION */}
        <div className="mb-6">
          <PrintTestLabel />
        </div>
        
        {/* TAB NAVIGATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="graded" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Graded
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Raw
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="graded">
            <GradedCardIntake onBatchAdd={handleBatchAdd} />
          </TabsContent>
          
          <TabsContent value="raw">
            <TCGPlayerBulkImport onBatchAdd={handleBatchAdd} />
          </TabsContent>
        </Tabs>

        {/* BATCH PANEL - Always Visible */}
        <div className="mt-8 border-t border-border pt-6">
          <CurrentBatchPanel onBatchCountUpdate={(count) => setBatchCount(count)} />
        </div>
      </div>
    </div>
  );
}