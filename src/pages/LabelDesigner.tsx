import React from 'react';
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

        <AdvancedLabelDesigner />
      </main>
    </>
  );
}