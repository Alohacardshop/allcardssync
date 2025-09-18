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
import { useStore } from "@/contexts/StoreContext";
import { v4 as uuidv4 } from 'uuid';
import { generateSKU, generateTCGSKU } from '@/lib/sku';
import { fetchCardPricing } from '@/hooks/useTCGData';
import { tcgSupabase } from '@/integrations/supabase/client';
import { CsvPasteArea } from '@/components/csv/CsvPasteArea';
import { NormalizedCard } from '@/lib/csv/normalize';

// Helper function to detect game from TCGPlayer product line
const detectGameFromProductLine = (productLine?: string): string | null => {
  if (!productLine) return null;
  
  const line = productLine.toLowerCase();
  if (line.includes('pokemon')) return 'pokemon';
  if (line.includes('magic') || line.includes('mtg')) return 'mtg';
  if (line.includes('yugioh') || line.includes('yu-gi-oh')) return 'yugioh';
  if (line.includes('dragon ball')) return 'dragonball';
  if (line.includes('digimon')) return 'digimon';
  if (line.includes('flesh and blood')) return 'fab';
  
  return null;
};

// Helper function to capitalize first letter
const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Helper function to create human-readable descriptions
const createHumanReadableDescription = (item: TCGPlayerItem): string => {
  const parts = [];
  
  // Main title with card number if available
  const title = item.cardNumber 
    ? `**${item.name} (${item.cardNumber})**`
    : `**${item.name}**`;
  parts.push(title);
  
  // Set information
  if (item.set) {
    parts.push(`- Set: ${item.set}`);
  }
  
  // Rarity
  if (item.rarity) {
    parts.push(`- Rarity: ${item.rarity}`);
  }
  
  // Condition
  if (item.condition) {
    parts.push(`- Condition: ${item.condition}`);
  }
  
  // Market Price
  if (item.marketPrice && item.marketPrice > 0) {
    parts.push(`- Market Price: $${item.marketPrice.toFixed(2)}`);
  }
  
  // Quantity if greater than 1
  if (item.quantity > 1) {
    parts.push(`- Quantity: ${item.quantity}`);
  }
  
  // Photo URL
  if (item.photoUrl) {
    parts.push(`- Image: ${item.photoUrl}`);
  }
  
  return parts.join('\n');
};

interface TCGPlayerItem {
  tcgplayerId?: string; // TCGPlayer ID for SKU generation
  productLine?: string; // Game information from TCGPlayer
  rarity?: string; // Original TCGPlayer rarity
  photoUrl?: string; // TCGPlayer product image URL
  marketPrice?: number; // TCGPlayer market price
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
  variantId?: string; // TCG variant ID if resolved
  cardId?: string; // TCG card ID if found
}

interface TCGPlayerBulkImportProps {
  onBatchAdd?: (itemData: any) => void;
}

export const TCGPlayerBulkImport = ({ onBatchAdd }: TCGPlayerBulkImportProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<TCGPlayerItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { assignedStore, selectedLocation } = useStore();
  const batchId = uuidv4(); // Generate a unique batch ID for this import session

  // Handle CSV parsing results
  const handleCsvParsed = (cards: NormalizedCard[]) => {
    const tcgItems: TCGPlayerItem[] = cards.map(card => ({
      tcgplayerId: card.id, // Preserve TCGPlayer ID
      productLine: card.line, // Game information from TCGPlayer (Product Line -> line)
      rarity: card.rarity, // Original TCGPlayer rarity
      photoUrl: card.photoUrl, // TCGPlayer product image
      marketPrice: card.marketPrice, // TCGPlayer market price
      quantity: card.quantity || 1,
      name: card.name,
      set: card.set,
      cardNumber: card.number,
      foil: card.rarity || 'Normal',
      condition: card.condition,
      language: 'English', // Default, could be enhanced
      priceEach: card.marketPrice || 0,
      totalPrice: (card.marketPrice || 0) * (card.quantity || 1),
      status: 'pending' as const
    }));
    
    setItems(tcgItems);
    toast.success(`Loaded ${tcgItems.length} items from CSV`);
  };

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
          status: 'pending',
          // TCGPlayer data will be enhanced by CSV parsing if available
          marketPrice: priceEach
        });
      });

      setItems(parsedItems);
      toast.success(`Loaded ${parsedItems.length} items from TCGPlayer list`);
    };
    reader.readAsText(file);
  };

  // Resolve variant ID for a TCGPlayer item by searching TCG database
  const resolveVariantId = async (item: TCGPlayerItem): Promise<{ cardId?: string; variantId?: string }> => {
    try {
      // Search for the card first
      const { data: cards } = await tcgSupabase
        .from('cards')
        .select('id, name, sets!inner(name)')
        .ilike('name', `%${item.name}%`)
        .limit(10);

      if (!cards?.length) return {};

      // Find best match
      const cardMatch = cards.find(card => {
        const setName = (card.sets as any)?.name;
        return card.name.toLowerCase().includes(item.name.toLowerCase()) &&
               setName?.toLowerCase().includes(item.set.toLowerCase());
      }) || cards[0];

      if (!cardMatch) return {};

      // Get pricing data to find variant
      const pricingData = await fetchCardPricing(cardMatch.id);
      
      if (pricingData?.variants?.length) {
        // Find matching variant by condition and printing
        const variant = pricingData.variants.find(v => 
          v.condition?.toLowerCase() === item.condition.toLowerCase() &&
          v.printing?.toLowerCase().includes(item.foil.toLowerCase())
        ) || pricingData.variants[0];

        if (variant?.id) {
          return { cardId: cardMatch.id, variantId: variant.id };
        }
      }

      return { cardId: cardMatch.id };
    } catch (error) {
      console.warn('Failed to resolve variant ID:', error);
      return {};
    }
  };

  const insertIntakeItem = async (item: TCGPlayerItem) => {
    // Try to resolve variant ID first
    const { cardId, variantId } = await resolveVariantId(item);
    
    // Update item with resolved IDs
    item.cardId = cardId;
    item.variantId = variantId;
    
    // Enhanced game detection from TCGPlayer product line
    const gameKey = detectGameFromProductLine(item.productLine) || 'pokemon';
    
    // Generate SKU prioritizing TCGPlayer ID
    const sku = generateTCGSKU(item.tcgplayerId, gameKey, variantId, cardId);
    
    try {
      const rpcParams = {
        store_key_in: assignedStore || null,
        shopify_location_gid_in: selectedLocation || null,
        quantity_in: item.quantity,
        brand_title_in: item.set,
        subject_in: item.name,
        category_in: gameKey === 'pokemon' ? 'Pokemon' : capitalize(gameKey),
        variant_in: `${item.condition}${item.foil ? ' - Foil' : ''}`,
        card_number_in: item.cardNumber,
        grade_in: null, // Raw cards should not have grades
        price_in: item.priceEach,
        cost_in: item.priceEach * 0.7,
        sku_in: sku,
        source_provider_in: 'tcgplayer',
        // Enhanced catalog snapshot with all TCGPlayer data
        catalog_snapshot_in: {
          name: item.name,
          set: item.set,
          number: item.cardNumber,
          condition: item.condition,
          foil: item.foil,
          language: item.language,
          card_id: cardId,
          variant_id: variantId,
          // TCGPlayer specific fields
          tcgplayer_id: item.tcgplayerId,
          product_line: item.productLine,
          rarity: item.rarity,
          photo_url: item.photoUrl,
          type: 'tcgplayer_raw',
          source: 'tcgplayer_bulk_import'
        },
        // Enhanced pricing snapshot with TCGPlayer market data
        pricing_snapshot_in: {
          price: item.priceEach,
          total_price: item.totalPrice,
          market_price: item.marketPrice,
          source: 'tcgplayer',
          captured_at: new Date().toISOString()
        },
        // Store complete raw TCGPlayer data
        source_payload_in: {
          ...item,
          import_source: 'tcgplayer_bulk_import',
          imported_at: new Date().toISOString(),
          filename: file?.name
        },
        // Use TCGPlayer photo for image URLs
        image_urls_in: item.photoUrl ? [item.photoUrl] : null,
        processing_notes_in: createHumanReadableDescription(item)
      };

      const response: any = await supabase.rpc('create_raw_intake_item', rpcParams);
      if (response.error) throw response.error;
      
      // Return the full item data for event dispatching
      return {
        id: response.data?.id,
        sku,
        item_data: rpcParams,
        store_key: assignedStore,
        location_gid: selectedLocation
      };
    } catch (error: any) {
      console.error('TCGPlayer bulk import error:', error);
      throw error;
    }
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error("No items to import");
      return;
    }

    if (!assignedStore || !selectedLocation) {
      toast.error("Please select a store and location before importing");
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
        const result = await insertIntakeItem(item);
        
        updatedItems[i] = { 
          ...updatedItems[i], 
          status: 'success',
          generatedSku: result.sku
        };

        // Dispatch events for batch management
        if (result.id) {
          // Dispatch custom event for components listening
          window.dispatchEvent(new CustomEvent('intake:item-added', {
            detail: {
              itemId: result.id,
              sku: result.sku,
              store: result.store_key,
              location: result.location_gid
            }
          }));

          // Call onBatchAdd callback if provided
          if (onBatchAdd) {
            onBatchAdd({
              id: result.id,
              sku: result.sku,
              store: result.store_key,
              location: result.location_gid,
              ...result.item_data
            });
          }

          // Dispatch batchItemAdded event for CurrentBatchPanel
          window.dispatchEvent(new CustomEvent('batchItemAdded', {
            detail: {
              item: {
                id: result.id,
                sku: result.sku,
                ...result.item_data
              },
              store: result.store_key,
              location: result.location_gid
            }
          }));
        }
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
            Paste & Parse TCGPlayer CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CsvPasteArea onParsed={handleCsvParsed} />
          
          <div className="border-t pt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="tcg-csv">Or Upload File</Label>
                <Input
                  id="tcg-csv"
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  disabled={importing}
                />
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Template
              </Button>
            </div>
          </div>
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
                  <TableHead>Number</TableHead>
                  <TableHead>Rarity</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Market Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.tcgplayerId && (
                          <div className="text-xs text-muted-foreground">ID: {item.tcgplayerId}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div>{item.set}</div>
                        {item.productLine && (
                          <div className="text-xs text-muted-foreground">{item.productLine}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{item.cardNumber || '-'}</TableCell>
                    <TableCell>{item.rarity || item.foil}</TableCell>
                    <TableCell>{item.condition}</TableCell>
                    <TableCell>
                      <div>
                        {item.marketPrice && item.marketPrice > 0 ? (
                          <div className="font-medium">${item.marketPrice.toFixed(2)}</div>
                        ) : (
                          <div>${item.priceEach.toFixed(2)}</div>
                        )}
                        {item.photoUrl && (
                          <div className="text-xs text-muted-foreground">📷 Image</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'success' ? 'bg-green-100 text-green-800' :
                        item.status === 'error' ? 'bg-red-100 text-red-800' :
                        item.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                      {item.error && (
                        <div className="text-xs text-red-600 mt-1 truncate" title={item.error}>
                          {item.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.generatedSku || (item.error ? 'Error' : '-')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {!importing && items.length > 0 && (
              <Button onClick={handleImport} className="mt-4">
                <Upload className="h-4 w-4 mr-2" />
                Import {items.length} Items
              </Button>
            )}

            {importing && (
              <div className="mt-4">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground mt-2">
                  Importing items... {Math.round(progress)}% complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};