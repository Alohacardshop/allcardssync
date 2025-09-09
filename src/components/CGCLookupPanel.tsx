import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Award, AlertCircle, Plus, CheckCircle, Image as ImageIcon } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { lookupCert, lookupBarcode } from "@/lib/cgc/client";
import type { CgcCard } from "@/lib/cgc/types";

interface CGCLookupPanelProps {
  onBatchAdd?: () => void;
}

// Normalize CGC card data to internal format
const mapCgcToNormalizedCard = (card: CgcCard): any => {
  // Build title with grade and autograph info
  let title = card.grade.displayGrade;
  if (card.grade.autographGrade && card.grade.autographType) {
    title += ` (${card.grade.autographType}: ${card.grade.autographGrade})`;
  }
  
  // Map game properly
  const game = card.collectible.game?.toLowerCase();
  const gameMapping = game?.includes('pokemon') ? 'pokemon' : 
                     game?.includes('magic') ? 'mtg' : 
                     card.collectible.game;

  return {
    id: card.certNumber,
    line: game === 'pokemon' ? 'Pokémon' : card.collectible.collectibleSubtype || card.collectible.collectibleType || 'Cards',
    set: card.collectible.setName || '',
    name: card.collectible.cardName || '',
    title: title,
    number: card.collectible.cardNumber || '',
    rarity: card.collectible.rarity || '',
    condition: `CGC ${card.grade.displayGrade}`,
    marketPrice: null, // CGC doesn't return price
    photoUrl: card.images?.frontThumbnailUrl || card.images?.frontUrl || null,
    quantity: 1,
    certNumber: card.certNumber,
    game: gameMapping,
    gradingCompany: 'CGC',
    metadata: card.metadata,
    population: card.population
  };
};

export const CGCLookupPanel = ({ onBatchAdd }: CGCLookupPanelProps) => {
  const [certNumber, setCertNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [cgcCard, setCgcCard] = useState<CgcCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  const { selectedStore, selectedLocation } = useStore();

  const handleError = (err: Error) => {
    let errorMessage = err.message;
    
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      errorMessage = "Certification not found (cards).";
    } else if (errorMessage.includes('auth expired') || errorMessage.includes('401') || errorMessage.includes('403')) {
      errorMessage = "CGC auth expired. Please check CGC credentials.";
    } else if (errorMessage.includes('unreachable') || errorMessage.includes('timeout')) {
      errorMessage = "CGC service unreachable, try again.";
    }
    
    setError(errorMessage);
    toast.error(errorMessage);
  };

  const handleLookupCert = async () => {
    if (!certNumber.trim()) {
      toast.error("Please enter a certification number");
      return;
    }

    setLoading(true);
    setError(null);
    setCgcCard(null);

    try {
      const card = await lookupCert(certNumber.trim());
      setCgcCard(card);
      toast.success("CGC certification verified");
    } catch (err) {
      handleError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleLookupBarcode = async () => {
    if (!barcode.trim()) {
      toast.error("Please enter a barcode");
      return;
    }

    setLoading(true);
    setError(null);
    setCgcCard(null);

    try {
      const card = await lookupBarcode(barcode.trim());
      setCgcCard(card);
      toast.success("CGC barcode verified");
      
      // Auto-focus back to barcode input for rapid scanning
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } catch (err) {
      handleError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLookupBarcode();
    }
  };

  const handleAddToBatch = async () => {
    if (!cgcCard) return;
    
    if (!selectedStore || !selectedLocation) {
      toast.error("Please select a store and location before adding to batch");
      return;
    }

    setSubmitting(true);

    try {
      const normalizedCard = mapCgcToNormalizedCard(cgcCard);
      
      // Check if item with same cert number already exists
      const { data: existing } = await supabase
        .from('intake_items')
        .select('id, quantity, sku')
        .eq('sku', cgcCard.certNumber)
        .is('deleted_at', null)
        .is('removed_from_batch_at', null);

      if (existing && existing.length > 0) {
        // Ask user if they want to increment quantity
        const increment = confirm(`A card with cert number ${cgcCard.certNumber} already exists in the batch. Do you want to increment the quantity instead?`);
        
        if (increment) {
          const { error: updateError } = await supabase
            .from('intake_items')
            .update({ 
              quantity: existing[0].quantity + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing[0].id);

          if (updateError) throw updateError;
          
          toast.success("Updated quantity for existing item");
          if (onBatchAdd) onBatchAdd();
          return;
        }
      }

      // Create new intake item
      const { data, error } = await supabase.rpc('create_raw_intake_item', {
        store_key_in: selectedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: 1,
        brand_title_in: normalizedCard.set,
        subject_in: normalizedCard.name,
        category_in: normalizedCard.line,
        variant_in: normalizedCard.title,
        card_number_in: normalizedCard.number,
        grade_in: cgcCard.grade.displayGrade,
        price_in: 0, // Will be set later
        cost_in: null,
        sku_in: cgcCard.certNumber,
        source_provider_in: 'cgc',
        catalog_snapshot_in: {
          type: 'cgc_card',
          cgc_data: cgcCard,
          normalized: normalizedCard
        },
        processing_notes_in: `CGC lookup - Cert ${cgcCard.certNumber}`
      });

      if (error) throw error;

      const responseData = Array.isArray(data) ? data[0] : data;
      
      // Update with CGC-specific fields
      if (responseData?.id) {
        await supabase
          .from('intake_items')
          .update({
            grading_company: 'CGC',
            cgc_cert: cgcCard.certNumber,
            cgc_snapshot: cgcCard
          })
          .eq('id', responseData.id);
      }

      toast.success("CGC card added to batch");
      
      // Clear form
      setCertNumber("");
      setBarcode("");
      setCgcCard(null);
      setError(null);
      
      if (onBatchAdd) onBatchAdd();
    } catch (error) {
      console.error('Error adding CGC card to batch:', error);
      toast.error('Failed to add card to batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-blue-500" />
          CGC Lookup (Cards Only)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cert-number">Certification Number</Label>
            <div className="flex gap-2">
              <Input
                id="cert-number"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="Enter cert number"
                disabled={loading}
              />
              <Button 
                onClick={handleLookupCert}
                disabled={loading || !certNumber.trim()}
                size="sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup Cert"}
              </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="barcode">Barcode (Scanner Ready)</Label>
            <div className="flex gap-2">
              <Input
                id="barcode"
                ref={barcodeInputRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyPress={handleBarcodeKeyPress}
                placeholder="Scan or enter barcode"
                disabled={loading}
              />
              <Button 
                onClick={handleLookupBarcode}
                disabled={loading || !barcode.trim()}
                size="sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup Barcode"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Press Enter after scanning</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* CGC Card Display */}
        {cgcCard && (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    CGC {cgcCard.grade.displayGrade}
                  </Badge>
                  {cgcCard.grade.autographType && (
                    <Badge variant="secondary">
                      {cgcCard.grade.autographType}: {cgcCard.grade.autographGrade}
                    </Badge>
                  )}
                </div>
                
                <div>
                  <h3 className="font-medium">{cgcCard.collectible.cardName || 'Unknown Card'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {cgcCard.collectible.setName} 
                    {cgcCard.collectible.cardNumber && ` #${cgcCard.collectible.cardNumber}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {cgcCard.collectible.game} • {cgcCard.collectible.language || 'English'} 
                    {cgcCard.collectible.rarity && ` • ${cgcCard.collectible.rarity}`}
                  </p>
                </div>

                {cgcCard.population?.populationAtGrade && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Population: </span>
                    <span className="font-medium">{cgcCard.population.populationAtGrade}</span>
                  </div>
                )}
              </div>

              {/* Images */}
              <div className="flex gap-2 ml-4">
                {cgcCard.images?.frontThumbnailUrl ? (
                  <img 
                    src={cgcCard.images.frontThumbnailUrl} 
                    alt="Card Front"
                    className="w-16 h-20 object-cover rounded border"
                  />
                ) : (
                  <div className="w-16 h-20 bg-muted rounded border flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                
                {cgcCard.images?.rearThumbnailUrl && (
                  <img 
                    src={cgcCard.images.rearThumbnailUrl} 
                    alt="Card Back"
                    className="w-16 h-20 object-cover rounded border"
                  />
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                onClick={handleAddToBatch}
                disabled={submitting}
                className="flex items-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add to Batch
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};