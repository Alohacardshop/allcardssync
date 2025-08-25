import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { PSABulkImport } from "@/components/PSABulkImport";
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
        
        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Graded Cards (PSA)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Import PSA certificate numbers and automatically fetch card details
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

          <Card>
            <CardHeader>
              <CardTitle>Raw Card Intake (JustTCG)</CardTitle>
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