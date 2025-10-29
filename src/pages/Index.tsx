import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Lock, Package, Layers } from 'lucide-react';
import { GradedCardIntake } from '@/components/GradedCardIntake';
import { TCGPlayerBulkImport } from '@/components/TCGPlayerBulkImport';
import { GradedComicIntake } from '@/components/GradedComicIntake';
import { RawComicIntake } from '@/components/RawComicIntake';
import { CurrentBatchPanel } from '@/components/CurrentBatchPanel';
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [collectibleType, setCollectibleType] = useState<'cards' | 'comics'>('cards');
  const [cardCondition, setCardCondition] = useState<'raw' | 'graded'>('raw');
  const [comicCondition, setComicCondition] = useState<'raw' | 'graded'>('raw');
  const [batchCount, setBatchCount] = useState(0);

  const handleBatchCountUpdate = useCallback((count: number) => {
    setBatchCount(count);
  }, []);

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto p-4">
        {/* TAB NAVIGATION - Collectible Type (Cards/Comics) */}
        <Tabs value={collectibleType} onValueChange={(value) => setCollectibleType(value as 'cards' | 'comics')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 h-14 p-1.5 bg-muted/50 border border-border">
            <TabsTrigger 
              value="cards" 
              className="flex items-center gap-3 text-lg font-semibold h-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <Package className="h-5 w-5" />
              🎴 Cards
            </TabsTrigger>
            <TabsTrigger 
              value="comics" 
              className="flex items-center gap-3 text-lg font-semibold h-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
            >
              <Layers className="h-5 w-5" />
              📚 Comics
            </TabsTrigger>
          </TabsList>

          {/* CARDS TAB CONTENT */}
          <TabsContent value="cards">
            <Tabs value={cardCondition} onValueChange={(value) => setCardCondition(value as 'raw' | 'graded')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="raw" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  📦 Raw Cards
                </TabsTrigger>
                <TabsTrigger value="graded" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  ⭐ Graded Cards
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="raw">
                <TCGPlayerBulkImport />
              </TabsContent>
              
              <TabsContent value="graded">
                <GradedCardIntake />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* COMICS TAB CONTENT */}
          <TabsContent value="comics">
            <Tabs value={comicCondition} onValueChange={(value) => setComicCondition(value as 'raw' | 'graded')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="raw" className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  📦 Raw Comics
                </TabsTrigger>
                <TabsTrigger value="graded" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  ⭐ Graded Comics
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
        <div className="mt-8 border-t border-border pt-6">
          <CurrentBatchPanel onBatchCountUpdate={handleBatchCountUpdate} />
        </div>
      </div>
    </div>
  );
}