import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StoreLocationSelector } from "@/components/StoreLocationSelector";
import { PSABulkImport } from "@/components/PSABulkImport";
import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { PageHeader } from "@/components/layout/PageHeader";


const BulkImport = () => {

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-8">
        <PageHeader
          title="Bulk Import"
          description="Import large quantities of cards from CSV files"
          showEcosystem
        />
        
        {/* Store & Location Selector */}
        <StoreLocationSelector />
        
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Raw Cards</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import raw card data from TCGPlayer or add manually
              </p>
            </CardHeader>
            <CardContent className="space-y-8">
              <TCGPlayerBulkImport />
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