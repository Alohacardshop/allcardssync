import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download, X } from 'lucide-react';
import { useStore } from "@/contexts/StoreContext";
import { v4 as uuidv4 } from 'uuid';
import { generateSKU, generateTCGSKU } from '@/lib/sku';
import { fetchCardPricing } from '@/hooks/useTCGData';
import { tcgSupabase } from '@/integrations/supabase/client';
import { CsvPasteArea } from '@/components/csv/CsvPasteArea';
import { NormalizedCard } from '@/lib/csv/normalize';
import { SubCategoryCombobox } from '@/components/ui/sub-category-combobox';
import { detectMainCategory } from '@/utils/categoryMapping';
import { useAddIntakeItem } from '@/hooks/useAddIntakeItem';
import { PurchaseLocationSelect } from '@/components/ui/PurchaseLocationSelect';

interface TCGPlayerItem {
  tcgplayerId?: string; // TCGPlayer ID for SKU generation (readonly)
  productLine?: string; // Game information from TCGPlayer
  rarity?: string; // Original TCGPlayer rarity
  photoUrl?: string; // TCGPlayer product image URL
  marketPrice?: number; // TCGPlayer market price (readonly)
  quantity: number;
  name: string;
  set: string;
  cardNumber?: string;
  foil: string;
  condition: string;
  language: string;
  priceEach: number; // User-entered selling price
  cost: number; // Calculated cost (70% of priceEach)
  totalPrice: number;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  info?: string; // For non-error messages like duplicate updates
  generatedSku?: string;
  variantId?: string; // TCG variant ID if resolved
  cardId?: string; // TCG card ID if found
}

interface TCGPlayerBulkImportProps {
  onBatchAdd?: (itemData: any) => void;
}

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

export const TCGPlayerBulkImport = ({ onBatchAdd }: TCGPlayerBulkImportProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<TCGPlayerItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [editingItem, setEditingItem] = useState<TCGPlayerItem | null>(null);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const { assignedStore, selectedLocation } = useStore();
  const { mutateAsync: addItem } = useAddIntakeItem();
  const batchId = uuidv4(); // Generate a unique batch ID for this import session
  const [mainCategory, setMainCategory] = useState('tcg');
  const [subCategory, setSubCategory] = useState('');
  const [purchaseLocationId, setPurchaseLocationId] = useState('');

  // Handle CSV parsing results
  const handleCsvParsed = (cards: NormalizedCard[]) => {
    const tcgItems: TCGPlayerItem[] = cards.map(card => ({
      tcgplayerId: card.id, // Preserve TCGPlayer ID
      productLine: card.line, // Game information from TCGPlayer (Product Line -> line)
      rarity: card.rarity, // Original TCGPlayer rarity
      photoUrl: card.photoUrl, // TCGPlayer product image
      marketPrice: card.marketPrice, // TCGPlayer market price (readonly)
      quantity: card.quantity || 1,
      name: card.name,
      set: card.set,
      cardNumber: card.number,
      foil: card.rarity || 'Normal',
      condition: card.condition,
      language: 'English', // Default, could be enhanced
      priceEach: calculateOurPrice(card.marketPrice || 0), // Apply new pricing formula for raw cards
      cost: Math.round((card.marketPrice || 0) * 0.7 * 100) / 100, // Calculate cost as 70% of TCGPlayer price, 2 decimals
      totalPrice: calculateOurPrice(card.marketPrice || 0) * (card.quantity || 1),
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
          priceEach: calculateOurPrice(priceEach), // Apply new pricing formula for raw cards
          cost: Math.round(priceEach * 0.7 * 100) / 100, // Calculate cost as 70% of TCGPlayer price, 2 decimals
          totalPrice: calculateOurPrice(priceEach) * quantity,
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

// Calculate our selling price based on market price for raw cards
  const calculateOurPrice = (marketPrice: number): number => {
    let calculatedPrice: number;
    
    if (marketPrice < 10) {
      // Less than $10: (+$0.51 rounded up to nearest whole dollar) + $1
      calculatedPrice = Math.ceil(marketPrice + 0.51) + 1;
    } else if (marketPrice <= 20) {
      // $10-20: x1.25 rounded up to nearest whole dollar
      calculatedPrice = Math.ceil(marketPrice * 1.25);
    } else if (marketPrice <= 26) {
      // $20-26: x1.15 rounded up to nearest whole dollar
      calculatedPrice = Math.ceil(marketPrice * 1.15);
    } else {
      // $26+: x1.1 rounded up to nearest multiple of $5
      calculatedPrice = Math.ceil((marketPrice * 1.1) / 5) * 5;
    }
    
    // Ensure 2 decimal places
    return Math.round(calculatedPrice * 100) / 100;
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

  // Handle row editing
  const handleRowClick = (item: TCGPlayerItem, index: number) => {
    if (item.status === 'processing') return; // Don't edit while processing
    setEditingItem({ ...item });
    setEditingIndex(index);
  };

  const handleSaveEdit = () => {
    if (editingItem && editingIndex >= 0) {
      const updatedItems = [...items];
      // Recalculate cost and total when price changes
      editingItem.cost = (editingItem.marketPrice || 0) * 0.7;
      editingItem.totalPrice = editingItem.priceEach * editingItem.quantity;
      updatedItems[editingIndex] = editingItem;
      setItems(updatedItems);
      setEditingItem(null);
      setEditingIndex(-1);
      toast.success('Item updated');
    }
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditingIndex(-1);
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
      const itemPayload = {
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
        cost_in: item.cost,
        sku_in: sku,
        source_provider_in: 'tcgplayer',
        main_category_in: mainCategory,
        sub_category_in: subCategory,
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
          // Include all pricing data in catalog for reference
          tcgplayer_market_price: item.marketPrice,
          entered_price: item.priceEach,
          calculated_cost: item.cost,
          type: 'tcgplayer_raw',
          source: 'tcgplayer_bulk_import',
          // Store image URLs in catalog_snapshot instead
          image_urls: item.photoUrl ? [item.photoUrl] : null,
          // Store source payload in catalog_snapshot instead  
          source_payload: {
            ...item,
            import_source: 'tcgplayer_bulk_import',
            imported_at: new Date().toISOString(),
            filename: file?.name
          }
        },
        // Enhanced pricing snapshot with TCGPlayer market data
        pricing_snapshot_in: {
          // User-entered selling price
          price: item.priceEach,
          total_price: item.totalPrice,
          // TCGPlayer market price (readonly)
          market_price: item.marketPrice,
          tcgplayer_price: item.marketPrice,
          // Calculated cost (70% of TCGplayer price)
          cost: item.cost,
          cost_percentage: 0.70,
          cost_basis: 'tcgplayer_market_price',
          source: 'tcgplayer',
          captured_at: new Date().toISOString()
        },
        processing_notes_in: createHumanReadableDescription(item)
      };

      const result = await addItem(itemPayload);
      
      // Update purchase location if selected
      if (purchaseLocationId && result.id) {
        await supabase
          .from('intake_items')
          .update({ purchase_location_id: purchaseLocationId })
          .eq('id', result.id);
      }
      
      // Return the full item data
      return {
        id: result.id,
        sku,
        item_data: itemPayload,
        store_key: assignedStore,
        location_gid: selectedLocation
      };
    } catch (error: any) {
      console.error('TCGPlayer bulk import error:', error);
      throw error;
    }
  };

  const handleAddToBatch = async () => {
    if (items.length === 0) {
      toast.error("No items to add to batch");
      return;
    }

    if (!assignedStore || !selectedLocation) {
      toast.error("Please select a store and location before adding to batch");
      return;
    }

    if (!subCategory) {
      toast.error("Please select a sub-category before adding to batch");
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

        // Add item to batch
        const result = await insertIntakeItem(item);
        
        // Check if it was a duplicate SKU update
        const isDuplicate = (result as any)?.isDuplicate;
        const oldQuantity = (result as any)?.oldQuantity;
        const newQuantity = (result as any)?.newQuantity;
        
        updatedItems[i] = { 
          ...updatedItems[i], 
          status: 'success',
          generatedSku: result.sku,
          info: isDuplicate ? `Quantity updated: ${oldQuantity} → ${newQuantity}` : undefined
        };

        // Call onBatchAdd callback if provided
        if (onBatchAdd && result.id) {
          onBatchAdd({
            id: result.id,
            sku: result.sku,
            store: result.store_key,
            location: result.location_gid,
            ...result.item_data
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing item ${i} (${item.name}):`, {
          error: errorMessage,
          item: item,
          store: assignedStore,
          location: selectedLocation,
          subCategory: subCategory
        });
        
        // Show detailed error toast for first failure to help diagnose
        if (processed === 0) {
          toast.error(`First item failed: ${errorMessage}`, {
            description: `Item: ${item.name} | Store: ${assignedStore || 'none'} | Location: ${selectedLocation || 'none'}`
          });
        }
        
        updatedItems[i] = {
          ...item,
          status: 'error',
          error: errorMessage
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

  const handleClear = () => {
    setItems([]);
    setFile(null);
    // Reset file input
    const fileInput = document.getElementById('tcg-csv') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    toast.success('Import data cleared');
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
        <>
          <Card>
            <CardHeader>
              <CardTitle>Import Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="mainCategory">Main Category</Label>
                  <Select value={mainCategory} onValueChange={setMainCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcg">🎴 TCG</SelectItem>
                      <SelectItem value="sports">⚾ Sports</SelectItem>
                      <SelectItem value="comics">📚 Comics</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="subCategory">Sub-Category <span className="text-destructive">*</span></Label>
                  <SubCategoryCombobox
                    mainCategory={mainCategory}
                    value={subCategory}
                    onChange={(value, mainCategoryId) => {
                      setSubCategory(value);
                      if (mainCategoryId) {
                        setMainCategory(mainCategoryId);
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <PurchaseLocationSelect
                  value={purchaseLocationId}
                  onChange={setPurchaseLocationId}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
          <CardHeader>
            <CardTitle>Import Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead className="w-24">TCG ID</TableHead>
                    <TableHead className="min-w-40">Card Name</TableHead>
                    <TableHead className="min-w-32">Set & Game</TableHead>
                    <TableHead className="w-20">Number</TableHead>
                    <TableHead className="w-24">Condition</TableHead>
                    <TableHead className="w-24">TCG Price</TableHead>
                    <TableHead className="w-24">Our Price</TableHead>
                    <TableHead className="w-24">Cost (70%)</TableHead>
                    <TableHead className="w-32">Image</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow 
                      key={index}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleRowClick(item, index)}
                    >
                      <TableCell className="font-medium">{item.quantity}</TableCell>
                      <TableCell>
                        {item.tcgplayerId ? (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono text-xs font-medium">
                            {item.tcgplayerId}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="space-y-1">
                          <div className="font-medium truncate">{item.name}</div>
                          {item.rarity && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                              {item.rarity}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <div className="space-y-1">
                          <div className="font-medium truncate">{item.set}</div>
                          {item.productLine && (
                            <div className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded truncate">
                              {item.productLine}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono">{item.cardNumber || '-'}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                          {item.condition}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          {item.marketPrice && item.marketPrice > 0 ? (
                            <div>
                              <div className="font-medium">${item.marketPrice.toFixed(2)}</div>
                              <div className="text-xs text-muted-foreground">TCG Market</div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400">No price</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          <div className="font-medium text-green-600">${item.priceEach.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">Selling</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          <div className="font-medium text-orange-600">${item.cost.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">Cost</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.photoUrl ? (
                          <div className="space-y-1">
                            <img 
                              src={item.photoUrl} 
                              alt={item.name}
                              className="w-12 h-12 object-cover rounded border"
                              onError={(e) => {
                                e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yNCAzNkMzMC42Mjc0IDM2IDM2IDMwLjYyNzQgMzYgMjRDMzYgMTcuMzcyNiAzMC42Mjc0IDEyIDI0IDEyQzE3LjM3MjYgMTIgMTIgMTcuMzcyNiAxMiAyNEMxMiAzMC42Mjc0IDE3LjM3MjYgMzYgMjQgMzYiIHN0cm9rZT0iIzlDQTNBRiIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0yNCAyOEMyNi4yMDkxIDI4IDI4IDI2LjIwOTEgMjggMjRDMjggMjEuNzkwOSAyNi4yMDkxIDIwIDI0IDIwQzIxLjc5MDkgMjAgMjAgMjEuNzkwOSAyMCAyNEMyMCAyNi4yMDkxIDIxLjc5MDkgMjggMjQgMjgiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+Cg==';
                              }}
                            />
                            <a 
                              href={item.photoUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline block truncate max-w-24"
                              title={item.photoUrl}
                            >
                              View Full
                            </a>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 text-center py-2">
                            No Image
                          </div>
                        )}
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
                          <div className="text-xs text-red-600 mt-1 truncate max-w-24" title={item.error}>
                            {item.error}
                          </div>
                        )}
                        {item.info && (
                          <div className="text-xs text-blue-600 mt-1 truncate max-w-24" title={item.info}>
                            {item.info}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            
            {/* Summary Info */}
            <div className="mt-4 p-4 bg-muted/50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Total Items:</span> {items.length}
                </div>
                <div>
                  <span className="font-medium">Total Value:</span> ${items.reduce((sum, item) => sum + (item.priceEach * item.quantity), 0).toFixed(2)}
                </div>
                <div>
                  <span className="font-medium">With TCG IDs:</span> {items.filter(item => item.tcgplayerId).length}
                </div>
                <div>
                  <span className="font-medium">With Images:</span> {items.filter(item => item.photoUrl).length}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Click any row to edit pricing and details
              </div>
            </div>
            
            {!importing && items.length > 0 && (
              <div className="mt-4 flex gap-2">
                <Button onClick={handleAddToBatch} disabled={!subCategory}>
                  <Upload className="h-4 w-4 mr-2" />
                  Add {items.length} Items to Batch
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  <X className="h-4 w-4 mr-2" />
                  Clear Data
                </Button>
              </div>
            )}

            {importing && (
              <div className="mt-4">
                <Progress value={progress} />
                <p className="text-sm text-muted-foreground mt-2">
                  Adding items to batch... {Math.round(progress)}% complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* Edit Item Dialog */}
      <Dialog open={editingItem !== null} onOpenChange={() => editingItem && handleCancelEdit()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>TCGPlayer ID (readonly)</Label>
                  <Input 
                    value={editingItem.tcgplayerId || ''} 
                    disabled 
                    className="bg-gray-50"
                  />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input 
                    type="number"
                    value={editingItem.quantity}
                    onChange={(e) => setEditingItem({
                      ...editingItem, 
                      quantity: parseInt(e.target.value) || 1
                    })}
                  />
                </div>
              </div>
              
              <div>
                <Label>Card Name</Label>
                <Input 
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Set</Label>
                  <Input 
                    value={editingItem.set}
                    onChange={(e) => setEditingItem({...editingItem, set: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Card Number</Label>
                  <Input 
                    value={editingItem.cardNumber || ''}
                    onChange={(e) => setEditingItem({...editingItem, cardNumber: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Condition</Label>
                  <Select 
                    value={editingItem.condition || ""} 
                    onValueChange={(value) => setEditingItem({...editingItem, condition: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-md z-50">
                      <SelectItem value="Near Mint">Near Mint</SelectItem>
                      <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                      <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                      <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Variant</Label>
                  <Input 
                    value={editingItem.foil || ''}
                    onChange={(e) => {
                      setEditingItem({
                        ...editingItem, 
                        foil: e.target.value
                      });
                    }}
                    placeholder="e.g., Foil, Reverse Holo"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Rarity</Label>
                  <Input 
                    value={editingItem.rarity || ''}
                    onChange={(e) => setEditingItem({...editingItem, rarity: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Language</Label>
                  <Input 
                    value={editingItem.language || 'English'}
                    onChange={(e) => setEditingItem({...editingItem, language: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>TCGPlayer Price (readonly)</Label>
                  <Input 
                    value={editingItem.marketPrice ? `$${editingItem.marketPrice.toFixed(2)}` : 'No price'}
                    disabled 
                    className="bg-gray-50"
                  />
                </div>
                <div>
                  <Label>Our Selling Price</Label>
                  <Input 
                    type="number"
                    step="0.01"
                    value={editingItem.priceEach}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0;
                      setEditingItem({
                        ...editingItem, 
                        priceEach: price,
                        cost: price * 0.7,
                        totalPrice: price * editingItem.quantity
                      });
                    }}
                  />
                </div>
                <div>
                  <Label>Cost (70% of price)</Label>
                  <Input 
                    value={`$${editingItem.cost.toFixed(2)}`}
                    disabled 
                    className="bg-gray-50"
                  />
                </div>
              </div>
              
              {editingItem.photoUrl && (
                <div>
                  <Label>Card Image</Label>
                  <div className="mt-2">
                    <img 
                      src={editingItem.photoUrl}
                      alt={editingItem.name}
                      className="w-32 h-32 object-cover rounded border"
                    />
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};