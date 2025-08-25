import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download } from "lucide-react";

interface TCGPlayerItem {
  quantity: number;
  name: string;
  set: string;
  cardNumber?: string;
  foil: string;
  condition: string;
  language: string;
  priceEach: number;
  totalPrice: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  generatedSku?: string;
}

export const TCGPlayerBulkImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<TCGPlayerItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      parseCSV(uploadedFile);
    }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim() && !line.startsWith('TOTAL:') && !line.startsWith('Prices from'));
      
      const parsedItems: TCGPlayerItem[] = [];

      lines.forEach(line => {
        // Parse line like: "1 Rayquaza VMAX (Secret) [SWSH12:] (Holofoil, Near Mint, English) - $14.53"
        // or "2 Infernape - 173/167 [SV06:] (Holofoil, Near Mint, English) - $22.56 ($11.28 ea)"
        
        const quantityMatch = line.match(/^(\d+)\s+(.+)/);
        if (!quantityMatch) return;

        const quantity = parseInt(quantityMatch[1]);
        const remainder = quantityMatch[2];

        // Extract price (handle both total and per-each formats)
        const priceMatch = remainder.match(/\$[\d,]+\.[\d]{2}(?:\s+\(\$[\d,]+\.[\d]{2}\s+ea\))?$/);
        if (!priceMatch) return;

        const priceStr = priceMatch[0];
        let priceEach: number;
        let totalPrice: number;

        if (priceStr.includes('ea)')) {
          // Format: "$22.56 ($11.28 ea)"
          const eachMatch = priceStr.match(/\(\$[\d,]+\.[\d]{2}\s+ea\)/);
          if (eachMatch) {
            priceEach = parseFloat(eachMatch[0].replace(/[\(\)$,\s]|ea/g, ''));
            totalPrice = priceEach * quantity;
          } else {
            return;
          }
        } else {
          // Format: "$14.53" (single item)
          totalPrice = parseFloat(priceStr.replace(/[$,]/g, ''));
          priceEach = totalPrice / quantity;
        }

        // Extract the name and details part (everything before the price)
        const nameAndDetails = remainder.substring(0, remainder.lastIndexOf(priceStr)).trim();

        // Extract set info [SET:] or [SET:number]
        const setMatch = nameAndDetails.match(/\[([^\]]+)\]/);
        const setInfo = setMatch ? setMatch[1] : '';
        
        // Extract card number if present (before the set)
        let cardNumber: string | undefined;
        let cardName = nameAndDetails;
        
        if (setMatch) {
          const beforeSet = nameAndDetails.substring(0, nameAndDetails.indexOf(setMatch[0])).trim();
          // Check if there's a card number pattern like "- 173/167"
          const cardNumMatch = beforeSet.match(/^(.+?)\s+-\s+([\d\/]+)$/);
          if (cardNumMatch) {
            cardName = cardNumMatch[1].trim();
            cardNumber = cardNumMatch[2];
          } else {
            cardName = beforeSet;
          }
        }

        // Extract condition info (Holofoil, Near Mint, English)
        const conditionMatch = nameAndDetails.match(/\(([^)]+)\)$/);
        const conditionInfo = conditionMatch ? conditionMatch[1].split(',').map(s => s.trim()) : [];
        
        const foil = conditionInfo[0] || 'Normal';
        const condition = conditionInfo[1] || 'Near Mint';
        const language = conditionInfo[2] || 'English';

        parsedItems.push({
          quantity,
          name: cardName,
          set: setInfo,
          cardNumber,
          foil,
          condition,
          language,
          priceEach,
          totalPrice,
          status: 'pending'
        });
      });

      setItems(parsedItems);
      toast.success(`Loaded ${parsedItems.length} items from TCGPlayer list`);
    };
    reader.readAsText(file);
  };

  const generateSKU = (item: TCGPlayerItem): string => {
    // Generate SKU: GAME-CONDITION-RANDOM
    const gameAbbr = 'PKM'; // Assuming Pokemon for now
    const conditionAbbr = item.condition.replace(/[^A-Z]/g, '').substring(0, 2) || 'NM';
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${gameAbbr}-${conditionAbbr}-${randomSuffix}`;
  };

  const insertIntakeItem = async (item: TCGPlayerItem) => {
    const sku = generateSKU(item);
    
    const { error } = await supabase
      .from('intake_items')
      .insert({
        sku,
        brand_title: item.set,
        subject: item.name,
        card_number: item.cardNumber,
        grade: item.condition,
        variant: item.foil,
        category: 'Pokemon', // Default category
        price: item.priceEach,
        cost: item.priceEach * 0.7, // Assume 70% cost ratio
        quantity: item.quantity
      });

    if (error) throw error;
    return sku;
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error("No items to import");
      return;
    }

    setImporting(true);
    setProgress(0);

    const updatedItems = [...items];
    let processed = 0;

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      
      try {
        // Update status to processing
        updatedItems[i] = { ...item, status: 'processing' };
        setItems([...updatedItems]);

        // Insert into database
        const sku = await insertIntakeItem(item);
        
        updatedItems[i] = { 
          ...updatedItems[i], 
          status: 'success',
          generatedSku: sku
        };
      } catch (error) {
        console.error(`Error processing item ${i}:`, error);
        updatedItems[i] = {
          ...item,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      processed++;
      setProgress((processed / updatedItems.length) * 100);
      setItems([...updatedItems]);

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setImporting(false);
    
    const successful = updatedItems.filter(item => item.status === 'success').length;
    const failed = updatedItems.filter(item => item.status === 'error').length;
    
    toast.success(`Import completed: ${successful} successful, ${failed} failed`);
  };

  const downloadTemplate = () => {
    const template = `TOTAL: 3 cards - $50.00
1 Pikachu VMAX [SV01:] (Holofoil, Near Mint, English) - $25.00
2 Charizard - 006/165 [SV:] (Holofoil, Near Mint, English) - $20.00 ($10.00 ea)
1 Professor Oak [Base:] (Normal, Near Mint, English) - $5.00
Prices from Market Price on 8/24/2025 and are subject to change.`;
    
    const blob = new Blob([template], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tcgplayer_template.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TCGPlayer List Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="tcg-csv">Upload TCGPlayer List</Label>
              <Input
                id="tcg-csv"
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                disabled={importing}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Upload a text file with TCGPlayer cart/list format
              </p>
            </div>
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Template
            </Button>
          </div>

          {items.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {items.length} items loaded
                </p>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? 'Importing...' : 'Start Import'}
                </Button>
              </div>

              {importing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-center text-muted-foreground">
                    {Math.round(progress)}% complete
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Import Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Qty</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Price Each</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="max-w-xs truncate">{item.name}</TableCell>
                    <TableCell>{item.set}</TableCell>
                    <TableCell>{item.condition}</TableCell>
                    <TableCell>${item.priceEach.toFixed(2)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'success' ? 'bg-green-100 text-green-800' :
                        item.status === 'error' ? 'bg-red-100 text-red-800' :
                        item.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.generatedSku || (item.error ? 'Error' : '-')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};