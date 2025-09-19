import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Lock, Package, Layers } from 'lucide-react';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { TCGPlayerBulkImport } from '@/components/TCGPlayerBulkImport';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [activeTab, setActiveTab] = useState('graded');
  const [batchCount, setBatchCount] = useState(0);

  // Listen for batch updates
  useEffect(() => {
    const handleBatchItemAdded = () => {
      // Batch count will be updated by CurrentBatchPanel callback
      toast({
        title: "Success",
        description: "Item added to batch! Switch to Batch tab to view."
      });
    };

    const handleSwitchToBatchTab = () => {
      setActiveTab('batch');
    };

    window.addEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
    window.addEventListener('switchToBatchTab', handleSwitchToBatchTab as EventListener);
    return () => {
      window.removeEventListener('batchItemAdded', handleBatchItemAdded as EventListener);
      window.removeEventListener('switchToBatchTab', handleSwitchToBatchTab as EventListener);
    };
  }, []);

  // Handle batch add callback
  const handleBatchAdd = () => {
    toast({
      title: "Success", 
      description: "Item added to batch! Switch to Batch tab to view."
    });
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto p-4">
        {/* TAB NAVIGATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="graded" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Graded
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Raw
            </TabsTrigger>
            <TabsTrigger value="batch" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Batch
              {batchCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {batchCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="graded">
            <div className="space-y-6">
              <GradedCardIntake onBatchAdd={handleBatchAdd} />
              <CurrentBatchPanel 
                onBatchCountUpdate={(count) => setBatchCount(count)} 
                compact={false}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="raw">
            <div className="space-y-6">
              <TCGPlayerBulkImport onBatchAdd={handleBatchAdd} />
              <CurrentBatchPanel 
                onBatchCountUpdate={(count) => setBatchCount(count)} 
                compact={false}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="batch">
            <CurrentBatchPanel onBatchCountUpdate={(count) => setBatchCount(count)} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}