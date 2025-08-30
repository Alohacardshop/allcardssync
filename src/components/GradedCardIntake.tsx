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

export const GradedCardIntake = () => {
  const [psaCert, setPsaCert] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [populatedFieldsCount, setPopulatedFieldsCount] = useState(0);
  const { selectedStore, selectedLocation } = useStore();

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
    console.log('handleFetchPSA called with cert:', psaCert.trim());
    
    if (!psaCert.trim()) {
      toast.error("Please enter a PSA certificate number");
      return;
    }

    console.log('Starting PSA fetch process...');
    const controller = new AbortController();
    setAbortController(controller);
    setFetching(true);
    
    try {
      console.log('Making supabase function call to psa-scrape...');
      // Race the function call with a timeout and abort signal
      const fetchPromise = supabase.functions.invoke('psa-scrape', {
        body: { cert: psaCert.trim() }
      });

      const timeoutPromise = new Promise((_, reject) => {
        const timeout = setTimeout(() => {
          console.log('PSA fetch timed out after 30 seconds');
          reject(new Error('Request timed out after 30 seconds'));
        }, 30000);
        
        controller.signal.addEventListener('abort', () => {
          console.log('PSA fetch cancelled by user');
          clearTimeout(timeout);
          reject(new Error('Request cancelled'));
        });
      });

      console.log('Waiting for PSA response...');
      const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;

      console.log('PSA response received:', { data, error });
      
      if (error) throw error;

      if (data && !data.error) {
        console.log('PSA data received successfully:', data);
        setCardData(data);
        
        // Enhanced field mapping with better fallbacks
        const extractYear = (text: string) => {
          const yearMatch = text?.match(/\b(19|20)\d{2}\b/);
          return yearMatch ? yearMatch[0] : "";
        };

        const extractGrade = (data: any) => {
          if (data.gradeNumeric !== undefined && data.gradeNumeric !== null) {
            return String(data.gradeNumeric);
          }
          if (data.grade) {
            const numericGrade = String(data.grade).match(/\d+(\.\d+)?/);
            return numericGrade ? numericGrade[0] : "";
          }
          if (data.gradeDisplay) {
            const numericGrade = String(data.gradeDisplay).match(/\d+(\.\d+)?/);
            return numericGrade ? numericGrade[0] : "";
          }
          return "";
        };

        // Prioritize CloudFront images
        const getBestImage = (data: any) => {
          if (data.imageUrls?.length > 0) {
            const cloudFrontImage = data.imageUrls.find((url: string) => 
              url.includes('cloudfront.net') || url.includes('d1htnxwo4o0jhw.cloudfront.net')
            );
            return cloudFrontImage || data.imageUrls[0];
          }
          return data.imageUrl || null;
        };

        const newFormData = {
          brandTitle: data.brandTitle || data.title || "",
          subject: data.subject || data.cardName || "",
          category: data.category || data.gameRaw || "",
          variant: data.varietyPedigree || "",
          cardNumber: data.cardNumber || "",
          year: data.year || extractYear(data.title || data.brandTitle || ""),
          grade: extractGrade(data),
          game: data.game || (data.gameRaw?.toLowerCase().includes('pokemon') ? 'pokemon' : 
                data.gameRaw?.toLowerCase().includes('magic') ? 'mtg' : 
                data.game || ""),
          certNumber: data.certNumber || psaCert,
          price: data.psaEstimate || "",
          cost: "",
          quantity: 1,
          psaEstimate: data.psaEstimate || ""
        };

        // Update card data with best image
        const bestImage = getBestImage(data);
        if (bestImage && bestImage !== data.imageUrl) {
          setCardData({...data, imageUrl: bestImage});
        }

        setFormData(newFormData);

        // Count populated fields (excluding always-populated ones like certNumber, quantity)
        const populatedCount = Object.entries(newFormData).filter(([key, value]) => 
          value && value !== "" && key !== 'certNumber' && key !== 'quantity' && key !== 'cost'
        ).length;
        setPopulatedFieldsCount(populatedCount);

        toast.success(`PSA data fetched - ${populatedCount} fields populated`);
      } else {
        console.log('PSA data error or no data:', data);
        throw new Error(data?.error || 'Failed to fetch PSA data');
      }
    } catch (error) {
      console.log('PSA fetch error occurred:', error);
      if (error?.message?.includes('cancelled') || error?.message?.includes('timed out')) {
        toast.info(error.message.includes('cancelled') ? "PSA fetch cancelled" : "PSA fetch timed out - try again");
      } else {
        console.error('PSA fetch error:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to fetch PSA data');
      }
    } finally {
      console.log('PSA fetch process completed');
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
      const { error } = await supabase
        .from('intake_items')
        .insert({
          psa_cert: formData.certNumber,
          brand_title: formData.brandTitle,
          subject: formData.subject,
          year: formData.year,
          grade: formData.grade,
          category: formData.category,
          card_number: formData.cardNumber,
          variant: formData.variant,
          price: formData.price ? parseFloat(formData.price) : 0,
          cost: formData.cost ? parseFloat(formData.cost) : null,
          quantity: formData.quantity,
          product_weight: 3.0, // 3 oz for graded cards
          // Store image URLs if available
          image_urls: cardData?.imageUrls ?? null,
          // Comprehensive data capture
          source_provider: 'psa',
          source_payload: {
            psa_cert: formData.certNumber,
            fetch_source: cardData?.source
          },
          grading_data: {
            psa_cert: formData.certNumber,
            grade: formData.grade,
            grading_company: 'PSA',
            cert_url: `https://www.psacard.com/cert/${formData.certNumber}`
          },
          catalog_snapshot: cardData,
          pricing_snapshot: {
            price: formData.price ? parseFloat(formData.price) : 0,
            captured_at: new Date().toISOString()
          },
          processing_notes: `Single graded card intake - PSA cert ${formData.certNumber}`,
          store_key: selectedStore,
          shopify_location_gid: selectedLocation
        });

      if (error) throw error;

      toast.success("Graded card added to inventory successfully");
      
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

    } catch (error) {
      console.error('Submit error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add card to inventory');
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
                  <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-40">
                    {JSON.stringify(cardData, null, 2)}
                  </pre>
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
            <span className={`px-2 py-1 rounded text-xs ${
              cardData.source === 'psa_api' ? 'bg-green-100 text-green-800' :
              cardData.source === 'scrape' ? 'bg-yellow-100 text-yellow-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {cardData.source === 'psa_api' ? 'PSA API' : cardData.source === 'scrape' ? 'Web Scraping' : 'Unknown'}
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
                Adding to Inventory...
              </>
            ) : (
              'Add to Inventory'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};