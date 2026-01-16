import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Layers, Lock } from 'lucide-react';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { TCGPlayerBulkImport } from '@/components/TCGPlayerBulkImport';
import { GradedComicIntake } from '@/components/GradedComicIntake';
import { RawComicIntake } from '@/components/RawComicIntake';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';
import { PageHeader } from '@/components/layout/PageHeader';

export default function Index() {
  const [collectibleType, setCollectibleType] = useState<'cards' | 'comics'>('cards');
  const [cardCondition, setCardCondition] = useState<'raw' | 'graded'>('raw');
  const [comicCondition, setComicCondition] = useState<'raw' | 'graded'>('raw');
  const [batchCount, setBatchCount] = useState(0);

  const handleBatchCountUpdate = useCallback((count: number) => {
    setBatchCount(count);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Intake" 
        description="Process new inventory items and manage batches"
        showEcosystem
      />

      {/* TAB NAVIGATION - Collectible Type (Cards/Comics) */}
      <Tabs value={collectibleType} onValueChange={(value) => setCollectibleType(value as 'cards' | 'comics')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50">
          <TabsTrigger 
            value="cards" 
            className="flex items-center gap-2 text-sm font-medium h-full data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
          >
            <Package className="h-4 w-4" />
            🎴 Cards
          </TabsTrigger>
          <TabsTrigger 
            value="comics" 
            className="flex items-center gap-2 text-sm font-medium h-full data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
          >
            <Layers className="h-4 w-4" />
            📚 Comics
          </TabsTrigger>
        </TabsList>

        {/* CARDS TAB CONTENT */}
        <TabsContent value="cards" className="mt-4">
          <Tabs value={cardCondition} onValueChange={(value) => setCardCondition(value as 'raw' | 'graded')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="raw" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Raw Cards
              </TabsTrigger>
              <TabsTrigger value="graded" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Graded Cards
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="raw">
              <TCGPlayerBulkImport onBatchAdd={handleBatchCountUpdate} />
            </TabsContent>
            
            <TabsContent value="graded">
              <GradedCardIntake />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* COMICS TAB CONTENT */}
        <TabsContent value="comics" className="mt-4">
          <Tabs value={comicCondition} onValueChange={(value) => setComicCondition(value as 'raw' | 'graded')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="raw" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Raw Comics
              </TabsTrigger>
              <TabsTrigger value="graded" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Graded Comics
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="raw">
              <RawComicIntake />
            </TabsContent>
            
            <TabsContent value="graded">
              <GradedComicIntake />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* BATCH PANEL - Always Visible */}
      <div className="border-t border-border pt-6">
        <CurrentBatchPanel onBatchCountUpdate={handleBatchCountUpdate} />
      </div>
    </div>
  );
}