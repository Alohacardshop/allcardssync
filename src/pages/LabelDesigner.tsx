import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleLabelDesigner } from '@/components/SimpleLabelDesigner';
import { AdvancedLabelDesigner } from '@/components/AdvancedLabelDesigner';
import { Navigation } from '@/components/Navigation';

export function LabelDesigner() {
  return (
    <>
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <Navigation />
        </div>
      </header>
      <main className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Label Designer</h1>
          <p className="text-muted-foreground">
            Create and print custom barcode labels for your inventory
          </p>
        </div>

      <Tabs defaultValue="advanced" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="advanced">Custom Designer</TabsTrigger>
          <TabsTrigger value="simple">Quick Print</TabsTrigger>
        </TabsList>
        
        <div className="mt-4 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div className="text-center">
              <p>Advanced canvas-based label design with full customization and templates</p>
            </div>
            <div className="text-center">
              <p>Fast template-based printing with PrintNode cloud printing support</p>
            </div>
          </div>
        </div>

        <TabsContent value="advanced" className="mt-6">
          <AdvancedLabelDesigner />
        </TabsContent>

        <TabsContent value="simple" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <SimpleLabelDesigner />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </main>
    </>
  );
}