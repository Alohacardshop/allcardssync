import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { StoreLocationSelector } from "@/components/StoreLocationSelector";
import { PSABulkImport } from "@/components/PSABulkImport";
import { GradedCardIntake } from "@/components/GradedCardIntake";
import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { RawCardIntake } from "@/components/RawCardIntake";
import { useToast } from "@/hooks/use-toast";

const BulkImport = () => {
  const { toast } = useToast();

  const handleCardPick = ({ card, chosenVariant }: {
    card: any;
    chosenVariant?: { condition: string; printing: string; price?: number };
  }) => {
    console.log('Selected card:', card);
    console.log('Chosen variant:', chosenVariant);
  };

  const handleBatchAdd = (item: any) => {
    toast({
      title: "Added to Batch",
      description: `${item.card.name} (${item.quantity}x) - SKU: ${item.sku}`,
    });
  };

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
          <Card id="graded">
            <CardHeader>
              <CardTitle>Single Graded Card Intake</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter a single PSA certificate number to add one card to inventory
              </p>
            </CardHeader>
            <CardContent>
              <GradedCardIntake />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk PSA Import</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a CSV file with multiple PSA certificate numbers for bulk import
              </p>
            </CardHeader>
            <CardContent>
              <PSABulkImport />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Raw Cards (TCGPlayer)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import card data from TCGPlayer cart/list format
              </p>
            </CardHeader>
            <CardContent>
              <TCGPlayerBulkImport />
            </CardContent>
          </Card>

          <Card id="raw">
            <CardHeader>
              <CardTitle>Raw Card Intake</CardTitle>
              <p className="text-sm text-muted-foreground">
                Search and select individual cards with intelligent pricing
              </p>
            </CardHeader>
            <CardContent>
              <RawCardIntake
                defaultGame="pokemon"
                defaultPrinting="Normal"
                defaultConditions="NM,LP"
                onPick={handleCardPick}
                onBatchAdd={handleBatchAdd}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default BulkImport;