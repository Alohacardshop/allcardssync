import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Award, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { invokePSAScrapeV2 } from "@/lib/psaServiceV2";
import { normalizePSAData } from "@/lib/psaNormalization";
import { AllLocationsSelector } from "@/components/AllLocationsSelector";

export const GradedCardIntake = () => {
  const [psaCert, setPsaCert] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [populatedFieldsCount, setPopulatedFieldsCount] = useState(0);
  const { selectedStore, selectedLocation, setSelectedLocation } = useStore();

  // Form fields that can be edited after fetching
  const [formData, setFormData] = useState({
    brandTitle: "",
    subject: "",
    category: "",
    variant: "",
    cardNumber: "",
    year: "",
    grade: "",
    game: "",
    certNumber: "",
    price: "",
    cost: "",
    quantity: 1,
    psaEstimate: ""
  });

  const handleFetchPSA = async () => {
    if (!psaCert.trim()) {
      toast.error("Please enter a PSA certificate number");
      return;
    }

    // Validate certificate number format (8-9 digits)
    if (!/^\d{8,9}$/.test(psaCert.trim())) {
      toast.error("PSA certificate numbers must be 8-9 digits");
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setFetching(true);
    
    try {
      // Use the enhanced PSA service with both markdown and HTML
      const data = await invokePSAScrapeV2({ cert: psaCert.trim(), forceRefresh: true, includeRaw: true }, 45000);

      if (data && data.ok) {
        console.log('PSA data received successfully:', JSON.stringify(data, null, 2));
        
        // Normalize the data to handle older cert formats
        const normalizedData = normalizePSAData(data);
        setCardData(normalizedData);
        
        const newFormData = {
          brandTitle: normalizedData.brandTitle || "",
          subject: normalizedData.subject || "",
          category: normalizedData.category || "",
          variant: normalizedData.varietyPedigree || "",
          cardNumber: normalizedData.cardNumber || "",
          year: normalizedData.year || "",
          grade: normalizedData.grade || "",
          game: normalizedData.gameSport || 
                (normalizedData.category?.toLowerCase().includes('pokemon') ? 'pokemon' : 
                 normalizedData.category?.toLowerCase().includes('magic') ? 'mtg' : ""),
          certNumber: normalizedData.certNumber || psaCert.trim(),
          price: "",
          cost: "",
          quantity: 1,
          psaEstimate: ""
        };

        setFormData(newFormData);

        // Count populated fields (excluding always-populated ones like certNumber, quantity)
        const populatedCount = Object.entries(newFormData).filter(([key, value]) => 
          value && value !== "" && key !== 'certNumber' && key !== 'quantity' && key !== 'cost' && key !== 'price' && key !== 'psaEstimate'
        ).length;
        setPopulatedFieldsCount(populatedCount);

        if (normalizedData.isValid) {
          toast.success(`PSA certificate verified - ${populatedCount} fields populated`);
        } else {
          toast.warning(`PSA certificate found but may have incomplete data - ${populatedCount} fields populated`);
        }
      } else {
        const errorMsg = data?.error || 'Invalid response from PSA scraping service';
        console.error('PSA fetch failed:', errorMsg);
        toast.error(`PSA fetch failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error('PSA fetch error:', error);
      if (error?.message?.includes('timed out')) {
        toast.error("PSA fetch timed out - try again");
      } else if (error?.message?.includes('cancelled')) {
        toast.info("PSA fetch cancelled");
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to fetch PSA data');
      }
    } finally {
      setFetching(false);
      setAbortController(null);
    }
  };

  const handleStopFetch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setFetching(false);
      toast.info("PSA fetch cancelled");
    }
  };

  const handleSubmit = async () => {
    if (!selectedStore || !selectedLocation) {
      toast.error("Please select a store and location before submitting");
      return;
    }

    if (!formData.certNumber) {
      toast.error("Please fetch PSA data first");
      return;
    }

    setSubmitting(true);
    try {
      // Use the new RPC with enhanced timeout and error handling
      const withTimeoutAndRetry = async <T,>(
        fn: () => Promise<T>, 
        timeoutMs = 20000, 
        retryCount = 1
      ): Promise<T> => {
        for (let attempt = 0; attempt <= retryCount; attempt++) {
          try {
            return await Promise.race([
              fn(),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Request timed out')), timeoutMs)
              )
            ]);
          } catch (error: any) {
            if (attempt === retryCount) throw error;
            if (error?.message?.includes('timed out')) {
              console.log(`Attempt ${attempt + 1} timed out, retrying...`);
              continue;
            }
            throw error;
          }
        }
        throw new Error('All retry attempts failed');
      };

      const rpcParams = {
        store_key_in: selectedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        brand_title_in: formData.brandTitle,
        subject_in: formData.subject,
        category_in: formData.category,
        variant_in: formData.variant,
        card_number_in: formData.cardNumber,
        grade_in: formData.grade,
        price_in: formData.price ? parseFloat(formData.price) : 0,
        cost_in: formData.cost ? parseFloat(formData.cost) : null,
        sku_in: `PSA-${formData.certNumber}`, // Generate simple SKU for PSA cards
        source_provider_in: 'psa',
        catalog_snapshot_in: cardData,
        pricing_snapshot_in: {
          price: formData.price ? parseFloat(formData.price) : 0,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `Single graded card intake - PSA cert ${formData.certNumber}`
      };

      const response: any = await withTimeoutAndRetry(
        async () => await supabase.rpc('create_raw_intake_item', rpcParams)
      );

      if (response.error) {
        console.error('RPC Error:', response.error);
        if (response.error.code === 'PGRST116') {
          throw new Error('Access denied - please check your permissions');
        } else if (response.error.message?.includes('store_key') || response.error.message?.includes('location')) {
          throw new Error('Invalid store or location selection');
        }
        throw response.error;
      }

      const responseData = Array.isArray(response.data) ? response.data[0] : response.data;

      // Dispatch browser event for real-time updates
      window.dispatchEvent(new CustomEvent('intake:item-added', { detail: responseData }));
      toast.success(`Added to batch (Lot ${responseData?.lot_number ?? ''})`);
      
      // Reset form
      setPsaCert("");
      setCardData(null);
      setFormData({
        brandTitle: "",
        subject: "",
        category: "",
        variant: "",
        cardNumber: "",
        year: "",
        grade: "",
        game: "",
        certNumber: "",
        price: "",
        cost: "",
        quantity: 1,
        psaEstimate: ""
      });

    } catch (error: any) {
      console.error('Error saving item:', error);
      const errorMessage = error?.message || 'Unknown error';
      
      if (errorMessage.includes('timed out')) {
        toast.error('Request timed out - please try again');
      } else if (errorMessage.includes('Access denied')) {
        toast.error('Access denied - please check your permissions');
      } else if (errorMessage.includes('store') || errorMessage.includes('location')) {
        toast.error('Please select a valid store and location');
      } else {
        toast.error(`Failed to add to batch: ${errorMessage}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const updateFormField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Graded Cards Intake
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Location Selector */}
        <div>
          <Label className="text-sm font-medium mb-2 block">Shopify Location</Label>
          <AllLocationsSelector
            value={selectedLocation || ""}
            onValueChange={setSelectedLocation}
            placeholder="Select location for intake"
            className="w-full"
          />
        </div>
        {/* PSA Cert Input */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label htmlFor="psa-cert">Enter PSA Cert # to fetch details</Label>
            <Input
              id="psa-cert"
              placeholder="e.g., 12345678"
              value={psaCert}
              onChange={(e) => setPsaCert(e.target.value)}
              disabled={fetching}
              onKeyDown={(e) => e.key === 'Enter' && !fetching && handleFetchPSA()}
            />
          </div>
          
          {!fetching ? (
            <Button 
              onClick={handleFetchPSA} 
              disabled={!psaCert.trim()}
              className="px-8"
            >
              Fetch PSA
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="outline"
                disabled
                className="px-8"
              >
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Fetching...
              </Button>
              <Button 
                variant="destructive"
                onClick={handleStopFetch}
                className="px-4"
              >
                Stop
              </Button>
            </div>
          )}
        </div>

        {/* Fetch Results Summary */}
        {cardData && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {populatedFieldsCount > 0 ? `${populatedFieldsCount} fields populated` : 'Only certificate number found'}
                </span>
                {populatedFieldsCount === 0 && (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <Collapsible open={showRawData} onOpenChange={setShowRawData}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    View raw data
                    {showRawData ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="space-y-3">
                    {/* Curated Fields */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Curated Fields</h4>
                      <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-40">
                        {JSON.stringify(cardData, null, 2)}
                      </pre>
                    </div>
                    
                    {/* Raw PSA API JSON */}
                    {cardData?.rawPayload && (
                      <div>
                        <h4 className="text-sm font-medium mb-2">Full PSA API JSON</h4>
                        <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-60">
                          {JSON.stringify(cardData.rawPayload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
            
            {populatedFieldsCount === 0 && (
              <div className="text-sm text-muted-foreground">
                Limited data found - you may need to fill in the details manually. Try a different certificate number or check if the PSA cert exists.
              </div>
            )}
          </div>
        )}

        {/* Card Image Preview */}
        {cardData?.imageUrl && (
          <div className="flex justify-center">
            <img 
              src={cardData.imageUrl} 
              alt="PSA Card"
              className="max-w-xs max-h-80 object-contain rounded-lg border shadow-md"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Form Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="brand-title">Brand / Title</Label>
            <Input
              id="brand-title"
              placeholder="e.g., POKEMON JAPANESE SV1a-TRIPLET BEAT"
              value={formData.brandTitle}
              onChange={(e) => updateFormField('brandTitle', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="e.g., MAGIKARP"
              value={formData.subject}
              onChange={(e) => updateFormField('subject', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="game">Game / Sport</Label>
            <Input
              id="game"
              placeholder="e.g., pokemon, mtg, baseball"
              value={formData.game}
              onChange={(e) => updateFormField('game', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              placeholder="e.g., TCG Cards"
              value={formData.category}
              onChange={(e) => updateFormField('category', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="variant">Variant / Pedigree</Label>
            <Input
              id="variant"
              placeholder="e.g., ART RARE"
              value={formData.variant}
              onChange={(e) => updateFormField('variant', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="card-number">Card Number</Label>
            <Input
              id="card-number"
              placeholder="e.g., 080"
              value={formData.cardNumber}
              onChange={(e) => updateFormField('cardNumber', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              placeholder="e.g., 2023"
              value={formData.year}
              onChange={(e) => updateFormField('year', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="grade">Grade (Number only)</Label>
            <Input
              id="grade"
              type="number"
              min="1"
              max="10"
              step="0.5"
              placeholder="e.g., 10"
              value={formData.grade}
              onChange={(e) => updateFormField('grade', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="cert-number">Cert Number</Label>
            <Input
              id="cert-number"
              placeholder="PSA Certificate Number"
              value={formData.certNumber}
              onChange={(e) => updateFormField('certNumber', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="price">Price ($)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.price}
              onChange={(e) => updateFormField('price', e.target.value)}
            />
            {formData.psaEstimate && (
              <p className="text-xs text-muted-foreground mt-1">
                PSA Estimate: ${formData.psaEstimate}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="cost">Cost ($)</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.cost}
              onChange={(e) => updateFormField('cost', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => updateFormField('quantity', parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Data Source Indicator */}
        {cardData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Data source:</span>
            <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
              {cardData.source === 'psa_api' ? 'PSA API' : 
               cardData.source === 'database_cache' ? 'Database Cache' : 'Unknown'}
            </span>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end pt-4">
          <Button 
            onClick={handleSubmit}
            disabled={submitting || !formData.certNumber}
            className="px-8"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding to Batch...
              </>
            ) : (
              'Add to Batch'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};