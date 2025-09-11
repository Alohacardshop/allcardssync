import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, AlertCircle, Trash2, FileText, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { StoreLocationSelector } from '@/components/StoreLocationSelector';
import { parseSmartTcgplayerCsv, type SmartParseResult } from '@/lib/csv/smartTcgplayerParser';
import { NormalizedCard } from '@/lib/csv/normalize';
import { generateSKU, generateTCGSKU } from '@/lib/sku';
import { fetchCardPricing } from '@/hooks/useTCGData';
import { tcgSupabase } from '@/lib/tcg-supabase';

interface RawCardWithPricing extends NormalizedCard {
  cost: number;
  price: number;
  // Additional fields for UI that aren't in base NormalizedCard
  language?: string;
  printing?: string;
}

interface RawCardIntakeProps {
  onBatchAdd?: (item: any) => void;
}

const EXAMPLE_TEXT = `TOTAL: 3 cards - $698.65
1 Blaine's Charizard [Gym] (1st Edition Holofoil, Near Mint, English) - $650.00
1 Iono - 091/071 [SV2D:] (Holofoil, Near Mint, Japanese) - $45.60
1 Bellibolt - 201/197 [SV03:] (Holofoil, Near Mint, English) - $3.05
Prices from Market Price on 9/7/2025 and are subject to change.`;

// Helper function to map product lines to game keys
const mapProductLineToGame = (productLine: string): string => {
  const product = productLine?.toLowerCase();
  if (product?.includes('pokemon')) return 'pokemon';
  if (product?.includes('magic') || product?.includes('mtg')) return 'magic-the-gathering';
  if (product?.includes('yugioh') || product?.includes('yu-gi-oh')) return 'yugioh';
  return 'pokemon'; // Default fallback
};

// Timeout wrapper for async operations
const withTimeout = (promise: PromiseLike<any>, timeoutMs: number): Promise<any> => {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
};

// Helper function to resolve variant ID for a card with timeout protection
const resolveVariantId = async (card: NormalizedCard): Promise<{ cardId?: string; variantId?: string }> => {
  try {
    const gameSlug = mapProductLineToGame(card.line || '');
    
    // Search for the card first with 5 second timeout
    const cardsPromise = tcgSupabase
      .from('cards')
      .select('id, name, sets!inner(name)')
      .ilike('name', `%${card.name}%`)
      .limit(10)
      .then(result => result);
      
    const { data: cards } = await withTimeout(
      cardsPromise,
      5000
    );

    if (!cards?.length) return {};

    // Find best match based on name and set
    const cardMatch = cards.find(c => {
      const setName = (c.sets as any)?.name;
      return c.name.toLowerCase().includes(card.name.toLowerCase()) &&
             setName?.toLowerCase().includes((card.set || '').toLowerCase());
    }) || cards[0];

    if (!cardMatch) return {};

    // Get pricing data to find variant with 3 second timeout
    const pricingData = await withTimeout(
      fetchCardPricing(cardMatch.id),
      3000
    );
    
    if (pricingData?.variants?.length) {
      // Find matching variant by condition 
      const variant = pricingData.variants.find(v => 
        v.condition?.toLowerCase() === (card.condition || 'near mint').toLowerCase()
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

export function RawCardIntake({ onBatchAdd }: RawCardIntakeProps) {
  const { selectedStore, selectedLocation, availableStores, availableLocations } = useStore();
  
  // Paste workflow state
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<RawCardWithPricing[]>([]);
  const [parseResult, setParseResult] = useState<SmartParseResult | null>(null);
  
  // UI state
  const [parsing, setParsing] = useState(false);
  const [addingToBatch, setAddingToBatch] = useState(false);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  
  // Progress tracking for batch add
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [currentProcessingItem, setCurrentProcessingItem] = useState<string>('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Access check function
  const checkAccessAndShowToast = async (): Promise<boolean> => {
    setAccessCheckLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("No user session found");
        return false;
      }

      if (!selectedStore || !selectedLocation) {
        toast.error("Store and location must be selected");
        return false;
      }

      const userId = session.user.id;
      const userIdLast6 = userId.slice(-6);
      const storeKeyTrimmed = selectedStore.trim();
      const locationGidTrimmed = selectedLocation.trim();

      // Use the diagnostic RPC for access check
      const { data: debugResult, error: debugError } = await supabase.rpc('debug_eval_intake_access', {
        _user_id: userId,
        _store_key: storeKeyTrimmed,
        _location_gid: locationGidTrimmed
      });

      if (debugError) {
        console.error('Access check error:', debugError);
        toast.error(`Access check failed: ${debugError.message}`);
        return false;
      }

      const result = debugResult as {
        user_id: string;
        store_key: string;
        location_gid: string;
        has_staff: boolean;
        can_access_location: boolean;
      };

      // Show diagnostic toast
      toast.info(`Access Check: User ${userIdLast6} | Store: ${result.store_key} | Location: ${result.location_gid} | hasStaff: ${result.has_staff} | canAccessLocation: ${result.can_access_location}`, {
        duration: 5000
      });

      if (!result.can_access_location) {
        toast.error(`Access denied — you're not assigned to this store/location (${result.store_key}, ${result.location_gid}).`);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Preflight check error:', error);
      toast.error(`Preflight check failed: ${error.message}`);
      return false;
    } finally {
      setAccessCheckLoading(false);
    }
  };

  // Parse paste text
  const handleParse = useCallback(() => {
    if (!pasteText.trim()) {
      toast.error('Please paste TCGplayer export data first');
      return;
    }

    setParsing(true);
    try {
      const result = parseSmartTcgplayerCsv(pasteText);
      setParseResult(result);
      
      if (result.data.length === 0) {
        toast.error(result.errors.length > 0 ? result.errors[0].reason : 'No valid cards found');
        return;
      }

      // Add cost and price fields to each card (required for batch add)
      const rowsWithCostAndPrice: RawCardWithPricing[] = result.data.map(card => ({
        ...card,
        cost: 0, // Will be auto-calculated when price is set
        price: card.marketPrice || 0, // Start with market price if available
        language: 'English', // Default language
        printing: card.title || 'Normal' // Map title to printing for UI compatibility
      }));

      // Auto-calculate cost at 70% of price for rows with price
      rowsWithCostAndPrice.forEach(row => {
        if (row.price && row.price > 0) {
          row.cost = Math.round(row.price * 0.7 * 100) / 100; // Round to 2 decimal places
        }
      });

      setParsedRows(rowsWithCostAndPrice);
      
      const confidenceText = result.confidence >= 80 ? 'high confidence' : 
                            result.confidence >= 60 ? 'medium confidence' : 'low confidence';
      
      toast.success(`Parsed ${result.data.length} cards (${confidenceText})`);
    } catch (error: any) {
      console.error('Parse error:', error);
      toast.error(`Parse failed: ${error.message}`);
    } finally {
      setParsing(false);
    }
  }, [pasteText]);

  // Clear all data
  const handleClear = useCallback(() => {
    setPasteText('');
    setParsedRows([]);
    setParseResult(null);
  }, []);

  // Update parsed row
  const updateRow = useCallback((index: number, field: keyof RawCardWithPricing, value: any) => {
    setParsedRows(prev => prev.map((row, i) => {
      if (i === index) {
        const updatedRow = { ...row, [field]: value };
        
        // Auto-calculate cost when price changes (70% of price)
        if (field === 'price' && value && value > 0) {
          updatedRow.cost = Math.round(value * 0.7 * 100) / 100; // Round to 2 decimal places
        }
        
        return updatedRow;
      }
      return row;
    }));
  }, []);

  // Remove row
  const removeRow = useCallback((index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Add all rows to batch with progress tracking and timeout protection
  const handleAddAllToBatch = async () => {
    // Validate all rows have costs and prices
    const invalidRows = parsedRows.filter((row, index) => 
      !row.cost || row.cost <= 0 || !row.price || row.price <= 0
    );

    if (invalidRows.length > 0) {
      toast.error(`Please set valid costs and prices for all ${invalidRows.length} rows before adding to batch`);
      return;
    }

    // Check access
    const hasAccess = await checkAccessAndShowToast();
    if (!hasAccess) {
      return;
    }

    setAddingToBatch(true);
    setBatchProgress({ current: 0, total: parsedRows.length });
    let successCount = 0;
    let errorCount = 0;

    try {
      // Process rows sequentially with progress feedback
      for (const [index, row] of parsedRows.entries()) {
        // Update progress
        setCurrentProcessingItem(`${row.name} (${index + 1}/${parsedRows.length})`);
        setBatchProgress({ current: index + 1, total: parsedRows.length });

        try {
          // Resolve variant ID with timeout protection
          let cardId: string | undefined;
          let variantId: string | undefined;
          
          try {
            const variantResult = await resolveVariantId(row);
            cardId = variantResult.cardId;
            variantId = variantResult.variantId;
          } catch (error) {
            console.warn(`Skipping variant resolution for ${row.name}:`, error);
            // Continue without variant data
          }
           
          // Map product line to game key
          const gameKey = mapProductLineToGame(row.line || '');
           
          // Prioritize TCGPlayer ID as SKU using new helper function
          const generatedSku = generateTCGSKU(row.id, gameKey, variantId, cardId);
           
          const formattedTitle = (() => {
            // Format title as: Game,Set,Name - Number,Condition
            const parts = [];
            if (row.line) parts.push(row.line);
            if (row.set) parts.push(row.set);
            
            // Use the card name as-is (it may already contain the number)
            parts.push(row.name);
            
            if (row.condition && row.condition !== 'Near Mint') parts.push(row.condition);
            else parts.push('Near Mint');
            
            return parts.join(',');
          })();

          const rpcParams = {
            store_key_in: selectedStore!.trim(),
            shopify_location_gid_in: selectedLocation!.trim(),
            quantity_in: row.quantity,
            brand_title_in: formattedTitle,
            subject_in: formattedTitle,
            category_in: 'Trading Cards', // Generic category for TCGplayer imports
            variant_in: row.title || 'Normal',
            card_number_in: row.number || '',
            grade_in: '', // leave empty so the DB marks item as Raw
            price_in: row.price || 0,
            cost_in: row.cost,
            sku_in: generatedSku,
            source_provider_in: 'tcgplayer_paste',
            catalog_snapshot_in: {
              name: row.name,
              set: row.set,
              number: row.number,
              language: 'English', // Default for smart parser
              tcgplayer_id: row.id,
              image_url: row.photoUrl,
              card_id: cardId,
              variant_id: variantId,
              game: gameKey
            },
            pricing_snapshot_in: {
              market_price: row.marketPrice,
              condition: row.condition,
              printing: row.title || 'Normal',
              language: 'English', // Default for smart parser
              captured_at: new Date().toISOString(),
              market_as_of: parseResult?.suggestions?.[0] || null
            },
            processing_notes_in: `TCGplayer paste import: ${row.name} from ${row.set || 'Unknown Set'}`
          };

          // Create intake item with timeout protection
          const rpcPromise = supabase.rpc('create_raw_intake_item', rpcParams)
            .then(result => result);
          const response = await withTimeout(
            rpcPromise,
            10000 // 10 second timeout for database operations
          );

          if (response.error) {
            console.error(`Row ${index + 1} error:`, response.error);
            toast.error(`Row ${index + 1} (${row.name}): ${response.error.message}`);
            errorCount++;
          } else {
            successCount++;
            
            // Dispatch browser event for real-time updates
            const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
            window.dispatchEvent(new CustomEvent('intake:item-added', { 
              detail: { ...responseData, lot_number: responseData?.lot_number }
            }));

            if (onBatchAdd) {
              onBatchAdd(responseData);
            }
          }
        } catch (error: any) {
          console.error(`Row ${index + 1} error:`, error);
          const errorMsg = error.message.includes('timed out') 
            ? `Timeout - ${row.name} took too long to process`
            : `${row.name}: ${error.message}`;
          toast.error(`Row ${index + 1}: ${errorMsg}`);
          errorCount++;
        }
      }

      // Show summary
      if (successCount > 0) {
        toast.success(`Successfully added ${successCount} items to batch`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to add ${errorCount} items - you can retry individual items later`);
      }

    } catch (error: any) {
      console.error('Batch add error:', error);
      toast.error(`Batch add failed: ${error.message}`);
    } finally {
      setAddingToBatch(false);
      setBatchProgress({ current: 0, total: 0 });
      setCurrentProcessingItem('');
    }
  };

  // Keyboard shortcuts
  const handleTextareaKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (parsedRows.length > 0) {
        handleAddAllToBatch();
      }
    }
  }, [handleParse, handleAddAllToBatch, parsedRows.length]);

  // Check if all rows have valid costs and prices
  const allRowsHaveValidCostsAndPrices = parsedRows.every(row => row.cost && row.cost > 0 && row.price && row.price > 0);
  const canAddToBatch = parsedRows.length > 0 && allRowsHaveValidCostsAndPrices && selectedStore && selectedLocation && !addingToBatch;

  return (
    <div className="space-y-6">
      {/* Store & Location Selection */}
      <StoreLocationSelector />

      {/* Access Alert */}
      {(!selectedStore || !selectedLocation) && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertCircle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            Please select both a store and location above to add cards to your batch.
          </AlertDescription>
        </Alert>
      )}

      {/* Paste Input Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Paste from TCGplayer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pasteText">TCGplayer Export Data</Label>
            <Textarea
              ref={textareaRef}
              id="pasteText"
              placeholder={`Paste TCGplayer export here...\n\nExample:\n${EXAMPLE_TEXT}`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              className="min-h-[150px] mt-2 font-mono text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1">
              Tip: Press Enter to parse, Ctrl+Enter to add all to batch
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={parsing || !pasteText.trim()}>
              {parsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                'Parse'
              )}
            </Button>
            <Button variant="ghost" onClick={handleClear} disabled={!pasteText && parsedRows.length === 0}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Parsed Results Table */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Parsed Cards</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Qty</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-20">Game</TableHead>
                    <TableHead className="w-24">Set</TableHead>
                    <TableHead className="w-20">Number</TableHead>
                    <TableHead className="w-24">Rarity</TableHead>
                    <TableHead className="w-32">Printing</TableHead>
                    <TableHead className="w-32">Condition</TableHead>
                    <TableHead className="w-24">Language</TableHead>
                    <TableHead className="w-20">TCG ID</TableHead>
                    <TableHead className="w-20">Image</TableHead>
                    <TableHead className="w-24">Market $ (ref)</TableHead>
                    <TableHead className="w-24">Price $ *</TableHead>
                    <TableHead className="w-24">Cost $ *</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={(() => {
                            // Format title as: Game,Set,Name - Number,Condition
                            const parts = [];
                            if (row.line) parts.push(row.line);
                            if (row.set) parts.push(row.set);
                            
                            let cardPart = row.name;
                            if (row.number) cardPart += ` - ${row.number}`;
                            parts.push(cardPart);
                            
                            if (row.condition && row.condition !== 'Near Mint') parts.push(row.condition);
                            else parts.push('Near Mint');
                            
                            return parts.join(',');
                          })()}
                          onChange={(e) => updateRow(index, 'name', e.target.value)}
                          className="min-w-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                         <div className="text-sm text-muted-foreground w-20 truncate" title={row.line || 'Unknown'}>
                           {row.line || '—'}
                         </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.set || ''}
                          onChange={(e) => updateRow(index, 'set', e.target.value)}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.number || ''}
                          onChange={(e) => updateRow(index, 'number', e.target.value)}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm w-24 truncate" title={row.rarity || 'Unknown'}>
                          {row.rarity || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={row.printing || 'Normal'} 
                          onValueChange={(value) => updateRow(index, 'printing', value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Normal">Normal</SelectItem>
                            <SelectItem value="Holofoil">Holofoil</SelectItem>
                            <SelectItem value="Reverse Holofoil">Reverse Holofoil</SelectItem>
                            <SelectItem value="1st Edition">1st Edition</SelectItem>
                            <SelectItem value="1st Edition Holofoil">1st Edition Holofoil</SelectItem>
                            <SelectItem value="unlimited">unlimited</SelectItem>
                            <SelectItem value="unlimited Holofoil">unlimited Holofoil</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={row.condition || 'Near Mint'} 
                          onValueChange={(value) => updateRow(index, 'condition', value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Sealed">Sealed</SelectItem>
                            <SelectItem value="Near Mint">Near Mint</SelectItem>
                            <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                            <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                            <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                            <SelectItem value="Damaged">Damaged</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={row.language || 'English'} 
                          onValueChange={(value) => updateRow(index, 'language', value)}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="English">English</SelectItem>
                            <SelectItem value="Japanese">Japanese</SelectItem>
                            <SelectItem value="Korean">Korean</SelectItem>
                            <SelectItem value="Chinese">Chinese</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                         <Input
                           value={row.id || ''}
                           onChange={(e) => updateRow(index, 'id', e.target.value)}
                           className="w-20"
                           placeholder="ID"
                         />
                      </TableCell>
                      <TableCell>
                        {row.photoUrl ? (
                          <div className="flex items-center space-x-2">
                            <img 
                              src={row.photoUrl} 
                              alt={row.name} 
                              className="w-8 h-8 object-cover rounded border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <Input
                              value={row.photoUrl || ''}
                              onChange={(e) => updateRow(index, 'photoUrl', e.target.value)}
                              className="w-16 text-xs"
                              placeholder="URL"
                            />
                          </div>
                        ) : (
                          <Input
                            value={row.photoUrl || ''}
                            onChange={(e) => updateRow(index, 'photoUrl', e.target.value)}
                            className="w-20"
                            placeholder="Image URL"
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          ${row.marketPrice?.toFixed(2) || '0.00'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.price || ''}
                          onChange={(e) => updateRow(index, 'price', parseFloat(e.target.value) || 0)}
                          className={`w-24 ${(!row.price || row.price <= 0) ? 'border-red-500' : ''}`}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.cost || ''}
                          onChange={(e) => updateRow(index, 'cost', parseFloat(e.target.value) || 0)}
                          className={`w-24 ${(!row.cost || row.cost <= 0) ? 'border-red-500' : ''}`}
                          placeholder="0.00"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRow(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary and Controls */}
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Parsed: {parsedRows.length} items • Total Market ${parsedRows.reduce((sum, row) => sum + ((row.marketPrice || 0) * row.quantity), 0).toFixed(2)}
                {parseResult?.confidence && ` • Confidence: ${parseResult.confidence.toFixed(0)}%`}
              </div>
              
              <Button 
                onClick={handleAddAllToBatch}
                disabled={!canAddToBatch || accessCheckLoading}
                className="flex items-center gap-2"
              >
                {addingToBatch ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add All to Batch
              </Button>
            </div>
            
            {/* Progress indicator during batch add */}
            {addingToBatch && batchProgress.total > 0 && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">
                    Processing Items...
                  </span>
                  <span className="text-sm text-blue-700">
                    {batchProgress.current} / {batchProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                  />
                </div>
                {currentProcessingItem && (
                  <div className="text-sm text-blue-700 truncate">
                    Current: {currentProcessingItem}
                  </div>
                )}
              </div>
            )}
            
            {/* Cost and price validation warning */}
            {parsedRows.length > 0 && !allRowsHaveValidCostsAndPrices && (
              <Alert className="mt-4 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  Please set valid costs and prices (greater than $0.00) for all rows highlighted in red before adding to batch.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}