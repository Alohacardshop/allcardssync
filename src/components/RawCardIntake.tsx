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
import { parseTcgplayerPaste, sumMarketPrice, type ParsedTcgplayerRow } from '@/lib/tcgplayerPasteParser';

interface RawCardIntakeProps {
  onBatchAdd?: (item: any) => void;
}

const EXAMPLE_TEXT = `TOTAL: 3 cards - $698.65
1 Blaine's Charizard [Gym] (1st Edition Holofoil, Near Mint, English) - $650.00
1 Iono - 091/071 [SV2D:] (Holofoil, Near Mint, Japanese) - $45.60
1 Bellibolt - 201/197 [SV03:] (Holofoil, Near Mint, English) - $3.05
Prices from Market Price on 9/7/2025 and are subject to change.`;

export function RawCardIntake({ onBatchAdd }: RawCardIntakeProps) {
  const { selectedStore, selectedLocation, availableStores, availableLocations } = useStore();
  
  // Paste workflow state
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedTcgplayerRow[]>([]);
  const [marketAsOf, setMarketAsOf] = useState<string | undefined>();
  const [totalMarketValue, setTotalMarketValue] = useState<number | undefined>();
  const [cardCount, setCardCount] = useState<number | undefined>();
  
  // UI state
  const [parsing, setParsing] = useState(false);
  const [addingToBatch, setAddingToBatch] = useState(false);
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  
  // Bulk entry state
  const [bulkQuantity, setBulkQuantity] = useState(1);
  const [bulkAmount, setBulkAmount] = useState(0);
  const [addingBulk, setAddingBulk] = useState(false);
  
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
      const result = parseTcgplayerPaste(pasteText);
      
      if (result.rows.length === 0) {
        toast.error('No valid cards found in the pasted text');
        return;
      }

      // Add cost and price fields to each row (required for batch add)
      const rowsWithCostAndPrice = result.rows.map(row => ({
        ...row,
        cost: 0, // Start with 0, user must fill in
        price: 0 // Start with 0, user must fill in
      }));

      setParsedRows(rowsWithCostAndPrice);
      setMarketAsOf(result.marketAsOf);
      setTotalMarketValue(result.totalMarketValue);
      setCardCount(result.cardCount);
      
      toast.success(`Parsed ${result.rows.length} cards successfully`);
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
    setMarketAsOf(undefined);
    setTotalMarketValue(undefined);
    setCardCount(undefined);
  }, []);

  // Update parsed row
  const updateRow = useCallback((index: number, field: keyof ParsedTcgplayerRow | 'cost', value: any) => {
    setParsedRows(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: value } : row
    ));
  }, []);

  // Remove row
  const removeRow = useCallback((index: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Add bulk item to batch
  const handleAddBulkToBatch = async () => {
    if (bulkQuantity <= 0 || bulkAmount <= 0) {
      toast.error('Please enter valid quantity and amount');
      return;
    }

    // Check access
    const hasAccess = await checkAccessAndShowToast();
    if (!hasAccess) {
      return;
    }

    setAddingBulk(true);

    try {
      const rpcParams = {
        store_key_in: selectedStore!.trim(),
        shopify_location_gid_in: selectedLocation!.trim(),
        quantity_in: bulkQuantity,
        brand_title_in: 'Card Bulk Item',
        subject_in: 'Card Bulk Item',
        category_in: 'Card Bulk',
        variant_in: 'Bulk',
        card_number_in: '',
        grade_in: '',
        price_in: bulkAmount,
        cost_in: bulkAmount, // Use same amount for cost
        sku_in: '',
        source_provider_in: 'bulk_entry',
        catalog_snapshot_in: {
          name: 'Card Bulk Item',
          type: 'card_bulk'
        },
        pricing_snapshot_in: {
          amount: bulkAmount,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `Card bulk entry: ${bulkQuantity} items at $${bulkAmount.toFixed(2)} each`
      };

      const response = await supabase.rpc('create_raw_intake_item', rpcParams);

      if (response.error) {
        console.error('Bulk add error:', response.error);
        toast.error(`Failed to add bulk item: ${response.error.message}`);
      } else {
        toast.success(`Successfully added card bulk item (${bulkQuantity} items) to batch`);
        
        // Dispatch browser event for real-time updates
        const responseData = Array.isArray(response.data) ? response.data[0] : response.data;
        window.dispatchEvent(new CustomEvent('intake:item-added', { 
          detail: { ...responseData, lot_number: responseData?.lot_number }
        }));

        if (onBatchAdd) {
          onBatchAdd(responseData);
        }

        // Reset form
        setBulkQuantity(1);
        setBulkAmount(0);
      }
    } catch (error: any) {
      console.error('Bulk add error:', error);
      toast.error(`Failed to add bulk item: ${error.message}`);
    } finally {
      setAddingBulk(false);
    }
  };

  // Add all rows to batch
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
    let successCount = 0;
    let errorCount = 0;

    try {
      // Process rows sequentially to avoid overwhelming the database
      for (const [index, row] of parsedRows.entries()) {
        try {
          const rpcParams = {
            store_key_in: selectedStore!.trim(),
            shopify_location_gid_in: selectedLocation!.trim(),
            quantity_in: row.quantity,
            brand_title_in: row.name,
            subject_in: row.name,
            category_in: 'Trading Cards', // Generic category for TCGplayer imports
            variant_in: row.printing || 'Normal',
            card_number_in: row.number || '',
            grade_in: row.condition || 'Near Mint',
            price_in: row.price || 0,
            cost_in: row.cost,
            sku_in: '', // Will be generated by the system
            source_provider_in: 'tcgplayer_paste',
            catalog_snapshot_in: {
              name: row.name,
              set: row.set,
              number: row.number,
              language: row.language,
              tcgplayer_id: row.tcgplayerId,
              image_url: row.photoUrl
            },
            pricing_snapshot_in: {
              market_price: row.marketPrice,
              condition: row.condition,
              printing: row.printing,
              language: row.language,
              captured_at: new Date().toISOString(),
              market_as_of: marketAsOf
            },
            processing_notes_in: `TCGplayer paste import: ${row.name} from ${row.set || 'Unknown Set'}`
          };

          const response = await supabase.rpc('create_raw_intake_item', rpcParams);

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
          toast.error(`Row ${index + 1} (${row.name}): ${error.message}`);
          errorCount++;
        }
      }

      // Show summary
      if (successCount > 0) {
        toast.success(`Successfully added ${successCount} items to batch`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to add ${errorCount} items`);
      }

    } catch (error: any) {
      console.error('Batch add error:', error);
      toast.error(`Batch add failed: ${error.message}`);
    } finally {
      setAddingToBatch(false);
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
                          value={row.name}
                          onChange={(e) => updateRow(index, 'name', e.target.value)}
                          className="min-w-[200px]"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground w-20 truncate" title={row.productLine || 'Unknown'}>
                          {row.productLine || '—'}
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
                            <SelectItem value="1st Edition">1st Edition</SelectItem>
                            <SelectItem value="1st Edition Holofoil">1st Edition Holofoil</SelectItem>
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
                          value={row.tcgplayerId || ''}
                          onChange={(e) => updateRow(index, 'tcgplayerId', e.target.value)}
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
                Parsed: {parsedRows.length} items • Total Market ${sumMarketPrice(parsedRows).toFixed(2)}
                {marketAsOf && ` • Market as-of: ${marketAsOf}`}
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

      {/* Bulk Cards Entry */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium whitespace-nowrap">Bulk cards</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                value={bulkQuantity}
                onChange={(e) => setBulkQuantity(parseInt(e.target.value) || 1)}
                className="w-20"
                placeholder="Qty"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm whitespace-nowrap">Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={bulkAmount}
                onChange={(e) => setBulkAmount(parseFloat(e.target.value) || 0)}
                className="w-24"
                placeholder="0.00"
              />
            </div>
            <Button 
              onClick={handleAddBulkToBatch} 
              disabled={addingBulk || bulkQuantity <= 0 || bulkAmount <= 0 || !selectedStore || !selectedLocation}
              size="sm"
            >
              {addingBulk ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add to Batch'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}