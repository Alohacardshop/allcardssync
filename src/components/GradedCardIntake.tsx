import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Award, ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle, Package, Plus } from "lucide-react";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { normalizePSAData } from "@/lib/psaNormalization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseFunctionError } from "@/lib/fns";
import { useLogger } from "@/hooks/useLogger";
import { validateCompleteStoreContext, logStoreContext } from "@/utils/storeValidation";
import { PSACertificateDisplay } from "@/components/PSACertificateDisplay";
import { CGCCertificateDisplay } from "@/components/CGCCertificateDisplay";
import { useDebounce } from "@/hooks/useDebounce";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PSACertificateData } from "@/types/psa";
import type { CGCCertificateData } from "@/types/cgc";
import { gradedCardSchema } from "@/lib/validation/intake-schemas";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";
import { useCurrentBatch } from "@/hooks/useCurrentBatch";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

interface GradedCardIntakeProps {
  onBatchAdd?: () => void;
}

// Helper function to extract numeric grade from PSA grade strings
const parsePSAGrade = (gradeStr: string): { numeric: string; original: string; hasNonNumeric: boolean } => {
  if (!gradeStr) return { numeric: "", original: "", hasNonNumeric: false };
  
  // Extract numeric part using regex - matches integers and decimals
  const numericMatch = gradeStr.match(/\d+(?:\.\d+)?/);
  const numeric = numericMatch ? numericMatch[0] : "";
  
  // Check if there are non-numeric parts (excluding spaces)
  const cleanedOriginal = gradeStr.replace(/\s+/g, " ").trim();
  const hasNonNumeric = cleanedOriginal !== numeric && cleanedOriginal.length > 0;
  
  return {
    numeric,
    original: cleanedOriginal,
    hasNonNumeric
  };
};

export const GradedCardIntake = ({ onBatchAdd }: GradedCardIntakeProps = {}) => {
  const logger = useLogger('GradedCardIntake');
  const { validateAccess, assignedStore, selectedLocation } = useIntakeValidation();
  const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();
  const { user } = useAuth();
  const { data: batchData } = useCurrentBatch({ 
    storeKey: assignedStore, 
    locationGid: selectedLocation,
    userId: user?.id 
  });

  // Grading service selection
  const [gradingService, setGradingService] = useState<'psa' | 'cgc'>('psa');

  // Form state
  const [certInput, setCertInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [cardData, setCardData] = useState<PSACertificateData | CGCCertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [populatedFieldsCount, setPopulatedFieldsCount] = useState(0);
  const [costPercentage, setCostPercentage] = useState(70); // Default 70%

  // Debounce barcode input for auto-fetch
  const debouncedBarcode = useDebounce(barcodeInput, 250);

  // Form fields that can be edited after fetching
  const [formData, setFormData] = useState({
    brandTitle: "",
    subject: "",
    category: "",
    variant: "",
    cardNumber: "",
    year: "",
    certNumber: "",
    grade: "",
    price: "",
    cost: "",
    quantity: 1,
    psaEstimate: "",
    varietyPedigree: "",
    mainCategory: "tcg",
    subCategory: "",
    vendor: "",
  });

  // Load vendors for the store
  const [vendors, setVendors] = useState<Array<{ vendor_name: string; is_default: boolean }>>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);

  useEffect(() => {
    const loadVendors = async () => {
      if (!assignedStore) return;
      
      setLoadingVendors(true);
      try {
        const { data, error } = await supabase
          .from('shopify_location_vendors')
          .select('vendor_name, is_default')
          .eq('store_key', assignedStore)
          .is('location_gid', null)
          .order('is_default', { ascending: false })
          .order('vendor_name', { ascending: true });

        if (error) throw error;

        setVendors(data || []);
        
        // Auto-select default vendor
        const defaultVendor = data?.find(v => v.is_default);
        if (defaultVendor && !formData.vendor) {
          setFormData(prev => ({ ...prev, vendor: defaultVendor.vendor_name }));
        }
      } catch (error) {
        logger.logError('Failed to load vendors', error instanceof Error ? error : new Error(String(error)));
      } finally {
        setLoadingVendors(false);
      }
    };

    loadVendors();
  }, [assignedStore]);

  // Helper function to sanitize certificate input (digits only)
  const sanitizeCertNumber = (input: string): string => {
    return input.replace(/\D+/g, '').slice(0, 12); // Max 12 digits
  };

  // Auto-populate cert number when barcode is scanned/entered
  useEffect(() => {
    if (debouncedBarcode && debouncedBarcode !== certInput) {
      const sanitized = sanitizeCertNumber(debouncedBarcode);
      setCertInput(sanitized);
      setFormData(prev => ({ ...prev, certNumber: sanitized }));
      // Clear barcode input after processing
      setBarcodeInput("");
    }
  }, [debouncedBarcode]);

  // Auto-populate cert number from input field
  useEffect(() => {
    logger.logDebug('certInput changed', { certInput });
    if (certInput) {
      setFormData(prev => ({ ...prev, certNumber: certInput }));
    }
  }, [certInput]);

  // Auto-calculate cost based on price and percentage
  useEffect(() => {
    if (formData.price && !isNaN(parseFloat(formData.price))) {
      const price = parseFloat(formData.price);
      const calculatedCost = (price * (costPercentage / 100)).toFixed(2);
      setFormData(prev => ({ ...prev, cost: calculatedCost }));
    }
  }, [formData.price, costPercentage]);

  // Reset fetch state on mount to recover from stuck states
  useEffect(() => {
    logger.logDebug('Component mounted, resetting state');
    setFetchState('idle');
    setAbortController(null);
  }, []);

  // Reset data when grading service changes
  useEffect(() => {
    setCardData(null);
    setFetchState('idle');
    setError(null);
    setCertInput("");
  }, [gradingService]);

  const updateFormField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFetchData = async () => {
    logger.logDebug('Fetch button clicked', { certInput, gradingService });
    const certNumber = sanitizeCertNumber(certInput.trim());
    
    // Always call the edge function, even if empty - server will handle validation
    setFetchState('loading');
    setError(null);
    setCardData(null);

    // Cancel any existing fetch
    if (abortController) {
      abortController.abort();
    }

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    try {
      updateFormField('certNumber', certNumber);

      // Call different edge functions based on grading service
      const functionName = gradingService === 'psa' ? 'psa-lookup' : 'cgc-lookup';
      const requestBody = gradingService === 'psa' 
        ? { cert_number: certNumber }
        : { certNumber, collectibleType: 'cards' };

      const { data, error: invokeError } = await supabase.functions.invoke(functionName, {
        body: requestBody
      });

      if (newAbortController.signal.aborted) {
        return;
      }

      if (invokeError) {
        throw new Error(invokeError.message || 'Failed to invoke PSA lookup function');
      }

      if (!data) {
        throw new Error('No response from PSA lookup service');
      }

      // Normalize response to { ok, data?, error? } pattern
      if (!data.ok) {
        // Handle specific "NO_DATA" signal
        if (data.error === 'NO_DATA') {
          setFetchState('empty');
          setError('No data found for that certificate number.');
          toast.info('No data found for that certificate number.');
          return;
        }
        setFetchState('error');
        setError(data.error || 'Unknown error occurred');
        toast.error(data.error || 'Failed to fetch card data');
        return;
      }

      if (!data.data) {
        setFetchState('empty');
        setError('No data found.');
        toast.info('No data found.');
        return;
      }

      // Success path - handle both PSA and CGC data
      if (gradingService === 'psa') {
        const normalizedData = normalizePSAData(data.data);
        setCardData({ ...normalizedData, source: data.source });
        
        // Auto-detect main category from PSA data - prioritize category field over brandTitle
        const detectedCategory = detectMainCategory(
          normalizedData.category || normalizedData.brandTitle || ''
        );
        
        // Try to auto-detect sub-category from category field
        const categoryField = (normalizedData.category || "").toLowerCase();
        const brandField = (normalizedData.brandTitle || "").toLowerCase();
        const combinedText = `${categoryField} ${brandField}`;
        
        const subCategoryGuess = combinedText.includes('baseball') ? 'Baseball' :
                                 combinedText.includes('football') ? 'Football' :
                                 combinedText.includes('basketball') ? 'Basketball' :
                                 combinedText.includes('hockey') ? 'Hockey' :
                                 combinedText.includes('soccer') ? 'Soccer' :
                                 combinedText.includes('pokemon') ? 'Pokemon' :
                                 combinedText.includes('magic') ? 'Magic: The Gathering' :
                                 combinedText.includes('yugioh') || combinedText.includes('yu-gi-oh') ? 'Yu-Gi-Oh!' :
                                 "";
        
        // Auto-populate form with fetched data
        setFormData(prev => ({
          ...prev,
          brandTitle: normalizedData.brandTitle || "",
          subject: normalizedData.subject || "",
          category: normalizedData.category || "",
          cardNumber: normalizedData.cardNumber || "",
          year: normalizedData.year || "",
          grade: normalizedData.grade || "",
          varietyPedigree: normalizedData.varietyPedigree || "",
          mainCategory: detectedCategory,
          subCategory: subCategoryGuess,
        }));
      } else {
        // CGC data handling
        const cgcData = data.data as CGCCertificateData;
        setCardData(cgcData);
        
        // Auto-detect main category from CGC data - check set name for sports/TCG indicators
        const combinedCGC = `${cgcData.setName || ''} ${cgcData.seriesName || ''}`;
        const detectedCategory = detectMainCategory(combinedCGC);
        
        // Try to auto-detect sub-category from CGC data
        const seriesOrSet = combinedCGC.toLowerCase();
        const subCategoryGuess = seriesOrSet.includes('baseball') ? 'Baseball' :
                                 seriesOrSet.includes('football') ? 'Football' :
                                 seriesOrSet.includes('basketball') ? 'Basketball' :
                                 seriesOrSet.includes('hockey') ? 'Hockey' :
                                 seriesOrSet.includes('soccer') ? 'Soccer' :
                                 seriesOrSet.includes('pokemon') ? 'Pokemon' :
                                 seriesOrSet.includes('magic') ? 'Magic: The Gathering' :
                                 seriesOrSet.includes('yugioh') || seriesOrSet.includes('yu-gi-oh') ? 'Yu-Gi-Oh!' :
                                 "";
        
        // Auto-populate form with CGC data
        setFormData(prev => ({
          ...prev,
          brandTitle: cgcData.seriesName || "",
          subject: cgcData.cardName || "",
          category: cgcData.setName || "",
          cardNumber: cgcData.cardNumber || "",
          year: "", // CGC doesn't provide year consistently
          grade: cgcData.grade || "",
          varietyPedigree: cgcData.autographGrade || "",
          mainCategory: detectedCategory,
          subCategory: subCategoryGuess,
        }));
      }

      setFetchState('success');
      toast.success("Card data fetched successfully!");
      logger.logInfo(`${gradingService.toUpperCase()} data fetched successfully`, { 
        certNumber, 
        service: gradingService,
        source: (data as any).source 
      });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      logger.logError('PSA fetch error', error);
      setFetchState('error');
      const errorMsg = error.message || 'Could not reach server. Check network/CORS/connection.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setAbortController(null);
    }
  };

  const handleSubmit = async () => {
    try {
      // Validate store context before submission
      const storeContext = validateCompleteStoreContext(
        { assignedStore, selectedLocation }, 
        'submit graded card intake'
      );
      
      logStoreContext('GradedCardIntake', storeContext, { 
        certNumber: formData.certNumber,
        price: formData.price 
      });
    } catch (error: any) {
      toast.error(error.message);
      return;
    }

    // Validate form data with zod schema
    const validationResult = gradedCardSchema.safeParse(formData);
    
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      toast.error(`Validation Error: ${firstError.message}`);
      return;
    }

    if (!formData.certNumber || !formData.grade || !formData.price || !formData.cost) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSubmitting(true);

      const itemPayload: any = {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: formData.grade,
        brand_title_in: formData.brandTitle,
        subject_in: formData.subject,
        category_in: formData.category,
        variant_in: formData.variant,
        card_number_in: formData.cardNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: formData.certNumber,
        main_category_in: formData.mainCategory,
        sub_category_in: formData.subCategory,
        catalog_snapshot_in: {
          ...cardData,
          [gradingService === 'psa' ? 'psa_cert' : 'cgc_cert']: formData.certNumber,
          grading_service: gradingService,
          year: formData.year
        }
      };

      const result = await addItem(itemPayload);

      // Update vendor immediately after insert
      if (formData.vendor && result?.id) {
        await supabase
          .from('intake_items')
          .update({ vendor: formData.vendor })
          .eq('id', result.id);
      }

      // Reset form but keep vendor, mainCategory, and subCategory
      const currentVendor = formData.vendor;
      const currentMainCategory = formData.mainCategory;
      const currentSubCategory = formData.subCategory;
      setCertInput("");
      setBarcodeInput("");
      setCardData(null);
      setFormData({
        brandTitle: "",
        subject: "",
        category: "",
        variant: "",
        cardNumber: "",
        year: "",
        certNumber: "",
        grade: "",
        price: "",
        cost: "",
        quantity: 1,
        psaEstimate: "",
        varietyPedigree: "",
        mainCategory: currentMainCategory,
        subCategory: currentSubCategory,
        vendor: currentVendor,
      });
      
      if (onBatchAdd) {
        onBatchAdd();
      }

    } catch (error: any) {
      logger.logError('Submit error', error);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelFetch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setFetchState('idle');
      toast.info(`${gradingService.toUpperCase()} fetch cancelled`);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Graded Cards Intake
            </div>
            {batchData && batchData.counts.activeItems > 0 && (
              <Badge variant="secondary" className="text-sm">
                <Package className="h-3 w-3 mr-1" />
                Current Batch: {batchData.counts.activeItems} {batchData.counts.activeItems === 1 ? 'item' : 'items'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grading Service Toggle */}
          <div className="space-y-2">
            <Label>Grading Service</Label>
            <RadioGroup value={gradingService} onValueChange={(value: 'psa' | 'cgc') => setGradingService(value)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="psa" id="psa" />
                <Label htmlFor="psa" className="font-normal cursor-pointer">PSA</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cgc" id="cgc" />
                <Label htmlFor="cgc" className="font-normal cursor-pointer">CGC</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Certificate Input Section */}
          <div className="space-y-2">
            <Label htmlFor="cert-input">Certificate Number</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="cert-input"
                  placeholder={`Enter ${gradingService.toUpperCase()} certificate number (digits only)`}
                  value={certInput}
                  onChange={(e) => {
                    const sanitized = sanitizeCertNumber(e.target.value);
                    setCertInput(sanitized);
                    if (error) setError(null); // Clear error on input change
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetchData();
                    }
                  }}
                  disabled={fetchState === 'loading'}
                  className={error ? "border-destructive" : ""}
                />
              </div>
              {/* PSA Fetch Button and Controls */}
              <Button 
                type="button"
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation();
                  logger.logDebug('Fetch Data button clicked', { gradingService });
                  handleFetchData(); 
                }}
                disabled={fetchState === 'loading'}
                size="default"
                style={{ position: 'relative', zIndex: 9999 }}
              >
                {fetchState === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Fetching...
                  </>
                ) : (
                  'Fetch Data'
                )}
              </Button>
              {fetchState === 'loading' && (
                <Button 
                  type="button"
                  onClick={cancelFetch}
                  variant="outline" 
                  size="default"
                >
                  Cancel
                </Button>
              )}
            </div>
            {fetchState === 'error' && error && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {fetchState === 'empty' && (
              <Alert className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error || 'No data found.'}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Barcode Scanner Input */}
          <div className="space-y-2">
            <Label htmlFor="barcode-input">Barcode Scanner</Label>
            <Input
              id="barcode-input"
              placeholder="Scan barcode here (auto-populates and fetches)"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              disabled={fetchState === 'loading'}
              className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
            />
            <p className="text-xs text-muted-foreground">
              Scanning will auto-populate the certificate field and fetch data
            </p>
          </div>

          {/* Certificate Display - Conditional based on service */}
          {fetchState === 'success' && cardData && (
            <div className="space-y-3">
              {gradingService === 'psa' ? (
                <PSACertificateDisplay 
                  psaData={cardData as PSACertificateData} 
                  className="border-2 border-primary/20 bg-primary/5"
                />
              ) : (
                <CGCCertificateDisplay 
                  cgcData={cardData as CGCCertificateData} 
                  className="border-2 border-primary/20 bg-primary/5"
                />
              )}
              
              {/* Raw Data Display */}
              <Collapsible open={showRawData} onOpenChange={setShowRawData}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    {showRawData ? <ChevronUp className="h-4 w-4 mr-2" /> : <ChevronDown className="h-4 w-4 mr-2" />}
                    {showRawData ? 'Hide' : 'Show'} Raw Data
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="p-4 bg-muted rounded-md">
                    <pre className="text-xs overflow-auto max-h-96">
                      {JSON.stringify(cardData, null, 2)}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="mainCategory">Main Category <span className="text-destructive">*</span></Label>
              <Select value={formData.mainCategory} onValueChange={(value) => {
                updateFormField('mainCategory', value);
                updateFormField('subCategory', ''); // Clear sub-category when main category changes
              }}>
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
                mainCategory={formData.mainCategory}
                value={formData.subCategory}
                onChange={(value, mainCategoryId) => {
                  updateFormField('subCategory', value);
                  if (mainCategoryId) {
                    updateFormField('mainCategory', mainCategoryId);
                  }
                }}
              />
            </div>

            <div>
              <Label htmlFor="brand">Brand <span className="text-destructive">*</span></Label>
              <Input
                id="brand"
                placeholder="Brand (e.g., Pokémon)"
                value={formData.brandTitle}
                onChange={(e) => updateFormField('brandTitle', e.target.value)}
                className={!formData.brandTitle ? "border-destructive/50" : ""}
              />
            </div>

            <div>
              <Label htmlFor="subject">Subject <span className="text-destructive">*</span></Label>
              <Input
                id="subject"
                placeholder="Card name/subject"
                value={formData.subject}
                onChange={(e) => updateFormField('subject', e.target.value)}
                className={!formData.subject ? "border-destructive/50" : ""}
              />
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="Category (e.g., Sports Card)"
                value={formData.category}
                onChange={(e) => updateFormField('category', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="variety">Variety/Pedigree</Label>
              <Input
                id="variety"
                placeholder="Variety or pedigree info"
                value={formData.varietyPedigree}
                onChange={(e) => updateFormField('varietyPedigree', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="vendor">Vendor (Optional)</Label>
              <Select 
                value={formData.vendor} 
                onValueChange={(value) => updateFormField('vendor', value)}
                disabled={loadingVendors}
              >
                <SelectTrigger>
                  <SelectValue placeholder={loadingVendors ? "Loading vendors..." : "Select vendor"} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.vendor_name} value={v.vendor_name}>
                      {v.vendor_name} {v.is_default ? '(Default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="grade">Grade <span className="text-destructive">*</span></Label>
              <Input
                id="grade"
                placeholder={`${gradingService.toUpperCase()} grade (e.g., 10)`}
                value={formData.grade}
                onChange={(e) => updateFormField('grade', e.target.value)}
                className={!formData.grade ? "border-destructive/50" : ""}
              />
            </div>

            <div>
              <Label htmlFor="card-number">Card Number</Label>
              <Input
                id="card-number"
                placeholder="Card number (e.g., 25/102)"
                value={formData.cardNumber}
                onChange={(e) => updateFormField('cardNumber', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                placeholder="Year (e.g., 1999)"
                value={formData.year}
                onChange={(e) => updateFormField('year', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="price">Price ($) <span className="text-destructive">*</span></Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => updateFormField('price', e.target.value)}
                className={!formData.price ? "border-destructive/50" : ""}
              />
            </div>

            <div>
              <Label htmlFor="costPercentage">Cost % of Price</Label>
              <Input
                id="costPercentage"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="70"
                value={costPercentage}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    setCostPercentage(val);
                  }
                }}
              />
            </div>

            <div>
              <Label htmlFor="cost">Cost ($) <span className="text-destructive">*</span></Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.cost}
                onChange={(e) => updateFormField('cost', e.target.value)}
                className={!formData.cost ? "border-destructive/50" : ""}
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

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                logger.logDebug('Add to Batch button clicked', { certNumber: formData.certNumber, grade: formData.grade });
                handleSubmit();
              }}
              disabled={submitting || !formData.certNumber || !formData.grade || !formData.price || !formData.cost}
              className="px-8"
              size="lg"
              style={{ position: 'relative', zIndex: 9999 }}
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
    </div>
  );
};