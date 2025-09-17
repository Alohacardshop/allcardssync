import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, Package, Layers } from 'lucide-react';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { RawCardIntake } from '@/components/RawCardIntake';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';

export default function Index() {
  const [activeTab, setActiveTab] = useState('graded');

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
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="graded">
            <GradedCardIntake />
          </TabsContent>
          
          <TabsContent value="raw">
            <RawCardIntake />
          </TabsContent>
          
          <TabsContent value="batch">
            <CurrentBatchPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}