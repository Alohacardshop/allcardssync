import React, { useState, useRef, useCallback, useContext, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, AlertCircle, Trash2, FileText, RotateCcw } from 'lucide-react';
import { Slider } from "@/components/ui/slider";
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useStore } from '@/contexts/StoreContext';
import { StoreLocationSelector } from '@/components/StoreLocationSelector';
import { parseSmartTcgplayerCsv, type SmartParseResult } from '@/lib/csv/smartTcgplayerParser';
import { NormalizedCard } from '@/lib/csv/normalize';
import { generateSKU, generateTCGSKU } from '@/lib/sku';
import { fetchCardPricing } from '@/hooks/useTCGData';
import { tcgSupabase } from '@/integrations/supabase/client';
import { useRawIntakeSettings } from '@/hooks/useRawIntakeSettings';
import { validateCompleteStoreContext, logStoreContext } from '@/utils/storeValidation';

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
  const { settings } = useRawIntakeSettings();
  const { assignedStore, selectedLocation, availableLocations } = useStore();
  
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
  
  // Hardcoded cost calculation percentage
  const COST_PERCENTAGE = 70;
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Calculate cost based on market price (what you paid)
  const calculateCost = useCallback((marketPrice: number): number => {
    return Math.round((marketPrice * COST_PERCENTAGE / 100) * 100) / 100;
  }, []);

  // Calculate margin percentage
  const calculateMargin = useCallback((price: number, cost: number): number => {
    if (price <= 0) return 0;
    return Math.round(((price - cost) / price * 100) * 100) / 100;
  }, []);

  // Access check function
  const checkAccessAndShowToast = async (): Promise<boolean> => {
    setAccessCheckLoading(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("No user session found");
        return false;
      }

      if (!assignedStore || !selectedLocation) {
        toast.error("Store and location must be selected");
        return false;
      }

      const userId = session.user.id;
      const userIdLast6 = userId.slice(-6);
      const storeKeyTrimmed = assignedStore.trim();
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
        cost: card.marketPrice ? calculateCost(card.marketPrice) : 0, // Calculate cost from market price
        price: card.marketPrice || 0, // Start with market price if available  
        language: 'English', // Default language
        printing: card.title || 'Normal' // Map title to printing for UI compatibility
      }));

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
  }, [pasteText, calculateCost]);

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
        
        // Handle field updates
        if (field === 'price') {
          updatedRow.price = typeof value === 'string' ? parseFloat(value) || 0 : value;
        } else if (field === 'cost') {
          updatedRow.cost = typeof value === 'string' ? parseFloat(value) || 0 : value;
        } else if (field !== 'marketPrice') {
          // Allow updating other fields like condition, quantity, etc. but not marketPrice
          (updatedRow as any)[field] = value;
        }
        
        return updatedRow;
      }
      return row;
    }));
  }, [calculateCost]);

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
           
          // Separate brand_title (set info) and subject (card name) to avoid duplication
          const brandTitle = (() => {
            const parts = [];
            if (row.line) parts.push(row.line);
            if (row.set) parts.push(row.set);
            return parts.join(',');
          })();

          const cardName = (() => {
            const parts = [];
            // Use the card name as-is (it may already contain the number)
            parts.push(row.name);
            
            if (row.condition && row.condition !== 'Near Mint') parts.push(row.condition);
            else parts.push('Near Mint');
            
            return parts.join(',');
          })();

          const rpcParams = {
            store_key_in: assignedStore!.trim(),
            shopify_location_gid_in: selectedLocation!.trim(),
            quantity_in: row.quantity,
            brand_title_in: brandTitle,
            subject_in: cardName,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Raw Card Intake</h2>
      </div>

      <StoreLocationSelector />

      <Card>
        <CardHeader>
          <CardTitle>Paste TCGplayer Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="paste-area">Paste your TCGplayer export here</Label>
            <Textarea
              ref={textareaRef}
              id="paste-area"
              placeholder="Paste your TCGplayer inventory export here..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                onClick={handleParse}
                disabled={parsing || !pasteText.trim()}
                size="sm"
              >
                {parsing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    Parse Cards (Enter)
                  </>
                )}
              </Button>
              
              <Button
                onClick={() => setPasteText(EXAMPLE_TEXT)}
                variant="outline"
                size="sm"
              >
                Try Example
              </Button>
              
              <Button
                onClick={handleClear}
                variant="outline"
                size="sm"
                disabled={parsing}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Clear
              </Button>
            </div>
          </div>

          {/* Access Check */}
          <div className="flex items-center gap-2">
            <Button
              onClick={checkAccessAndShowToast}
              disabled={accessCheckLoading || !assignedStore || !selectedLocation}
              variant="outline"
              size="sm"
            >
              {accessCheckLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                'Check Access'
              )}
            </Button>
            {!assignedStore || !selectedLocation ? (
              <span className="text-sm text-muted-foreground">Select store and location first</span>
            ) : null}
          </div>

          {/* Parse Results Summary */}
          {parseResult && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-medium">Parse Results</div>
                <div className={`text-xs px-2 py-1 rounded ${
                  parseResult.confidence >= 80 ? 'bg-green-100 text-green-800' :
                  parseResult.confidence >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {parseResult.confidence}% confidence
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Cards Found</div>
                  <div className="font-medium">{parseResult.data.length}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Parse Errors</div>
                  <div className="font-medium text-red-600">{parseResult.errors.length}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Quantity</div>
                  <div className="font-medium">{parseResult.data.reduce((sum, card) => sum + (card.quantity || 1), 0)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total Value</div>
                  <div className="font-medium">${parseResult.data.reduce((sum, card) => sum + ((card.marketPrice || 0) * (card.quantity || 1)), 0).toFixed(2)}</div>
                </div>
              </div>

              {parseResult.errors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800">
                    View {parseResult.errors.length} parsing errors
                  </summary>
                  <div className="mt-2 space-y-1 text-xs">
                    {parseResult.errors.slice(0, 10).map((error, index) => (
                      <div key={index} className="text-red-700 bg-red-50 p-2 rounded border-l-2 border-red-200">
                        {error.reason}
                      </div>
                    ))}
                    {parseResult.errors.length > 10 && (
                      <div className="text-muted-foreground">... and {parseResult.errors.length - 10} more errors</div>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>


      {/* Parsed Data Table */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Parsed Cards ({parsedRows.length})</CardTitle>
              
              {/* Add to batch section */}
              <div className="flex items-center gap-2">
                {addingToBatch && (
                  <div className="text-sm text-muted-foreground">
                    {batchProgress.current}/{batchProgress.total} - {currentProcessingItem}
                  </div>
                )}
                
                <Button
                  onClick={handleAddAllToBatch}
                  disabled={addingToBatch || parsedRows.length === 0 || !allRowsHaveValidCostsAndPrices}
                  className="gap-2"
                >
                  {addingToBatch ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Adding {batchProgress.current}/{batchProgress.total}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add All to Batch (Ctrl+Enter)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="min-w-[200px]">Name</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Market Price</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Margin</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, index) => {
                    const hasValidCostAndPrice = row.cost && row.cost > 0 && row.price && row.price > 0;
                    const margin = calculateMargin(row.price || 0, row.cost || 0);
                    
                    return (
                      <TableRow key={index} className={!hasValidCostAndPrice ? 'bg-red-50 border-red-200' : ''}>
                        <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          {row.number && <div className="text-xs text-muted-foreground">#{row.number}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{row.set}</div>
                          {row.line && <div className="text-xs text-muted-foreground">{row.line}</div>}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.condition || ''}
                            onChange={(e) => updateRow(index, 'condition', e.target.value)}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={row.quantity || 1}
                            onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            ${(row.marketPrice || 0).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.price || ''}
                            onChange={(e) => updateRow(index, 'price', e.target.value)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.cost || ''}
                            onChange={(e) => updateRow(index, 'cost', e.target.value)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <div className={`text-sm font-medium ${
                            margin < 20 
                              ? 'text-destructive' 
                              : margin > 40 
                              ? 'text-green-600' 
                              : 'text-foreground'
                          }`}>
                            {margin.toFixed(1)}%
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            onClick={() => removeRow(index)}
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Cost validation warning */}
            {parsedRows.length > 0 && !allRowsHaveValidCostsAndPrices && (
              <Alert className="mt-4 border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  Please set valid costs (greater than $0.00) for all rows highlighted in red before adding to batch. 
                  Costs are auto-calculated at {COST_PERCENTAGE}% of price but can be manually adjusted.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default RawCardIntake;