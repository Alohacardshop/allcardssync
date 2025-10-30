import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { StoreLocationSelector } from "@/components/StoreLocationSelector";
import { PSABulkImport } from "@/components/PSABulkImport";
import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { ManualRawCardEntry } from "@/components/ManualRawCardEntry";

const BulkImport = () => {

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto p-6 space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Bulk Import</h1>
          <p className="text-muted-foreground mt-2">Import large quantities of cards from CSV files</p>
        </div>
        
        {/* Store & Location Selector */}
        <StoreLocationSelector />
        
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>TCGPlayer Bulk Import</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import raw card data from TCGPlayer cart/list format
              </p>
            </CardHeader>
            <CardContent>
              <TCGPlayerBulkImport />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Manual Raw Card Entry</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quickly add individual raw cards to your batch
              </p>
            </CardHeader>
            <CardContent>
              <ManualRawCardEntry />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk PSA Import</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file or enter multiple PSA certificate numbers for bulk import
              </p>
            </CardHeader>
            <CardContent>
              <PSABulkImport />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BulkImport;