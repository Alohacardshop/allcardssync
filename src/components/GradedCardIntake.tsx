import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Award, ChevronDown, ChevronUp, AlertCircle, CheckCircle, XCircle, Package, Plus } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { invokePSAScrapeV2 } from "@/lib/psaServiceV2";
import { normalizePSAData } from "@/lib/psaNormalization";
import { invokeCGCLookup, normalizeCGCForIntake } from "@/lib/cgcService";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StoreLocationSelector } from "@/components/StoreLocationSelector";
import { parseFunctionError } from "@/lib/fns";
import { useLogger } from "@/hooks/useLogger";

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
  const logger = useLogger();
  const [gradingCompany, setGradingCompany] = useState<'PSA' | 'CGC'>('PSA');
  const [certInput, setCertInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [populatedFieldsCount, setPopulatedFieldsCount] = useState(0);
  const { selectedStore, selectedLocation, availableLocations, setSelectedLocation } = useStore();

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

  // Access check state
  const [accessCheckLoading, setAccessCheckLoading] = useState(false);
  const [accessResult, setAccessResult] = useState<{
    success: boolean;
    hasStaffRole: boolean;
    canAccessLocation: boolean;
    userId: string;
    error?: string;
  } | null>(null);

  const handleFetchCard = async () => {
    if (!certInput.trim()) {
      toast.error(`Please enter a ${gradingCompany} certificate number${gradingCompany === 'CGC' ? ' or barcode' : ''}`);
      return;
    }

    // Validate certificate number format based on company
    if (gradingCompany === 'PSA' && !/^\d{8,9}$/.test(certInput.trim())) {
      toast.error("PSA certificate numbers must be 8-9 digits");
      return;
    }

    const controller = new AbortController();
    setAbortController(controller);
    setFetching(true);
    
    logger.logInfo(`${gradingCompany} fetch started`, { certNumber: certInput.trim() });
    
    try {
      let data: any;
      
      if (gradingCompany === 'PSA') {
        // Use the enhanced PSA service
        data = await invokePSAScrapeV2({ cert: certInput.trim(), forceRefresh: true, includeRaw: true }, 45000);
      } else {
        // Use CGC service
        const cgcResult = await invokeCGCLookup({ 
          certNumber: /^\d+$/.test(certInput.trim()) ? certInput.trim() : undefined,
          barcode: !/^\d+$/.test(certInput.trim()) ? certInput.trim() : undefined,
          include: 'pop,images'
        }, 45000);
        
        if (cgcResult.ok && cgcResult.data) {
          data = { ok: true, ...normalizeCGCForIntake(cgcResult.data) };
        } else {
          data = { ok: false, error: cgcResult.error || 'CGC lookup failed' };
        }
      }

      if (data && data.ok) {
        console.log(`${gradingCompany} data received successfully:`, JSON.stringify(data, null, 2));
        
        let normalizedData: any;
        
        if (gradingCompany === 'PSA') {
          // Normalize PSA data
          normalizedData = normalizePSAData(data);
        } else {
          // CGC data is already normalized
          normalizedData = data;
        }
        
        setCardData(normalizedData);
        
        // Parse the grade to extract numeric value for the number input
        const gradeInfo = parsePSAGrade(normalizedData.grade || normalizedData.gradeNumeric || "");
        
        const newFormData = {
          brandTitle: normalizedData.brandTitle || "",
          subject: normalizedData.subject || "",
          category: normalizedData.category || "",
          variant: normalizedData.variant || normalizedData.varietyPedigree || "",
          cardNumber: normalizedData.cardNumber || "",
          year: normalizedData.year || "",
          grade: gradeInfo.numeric || normalizedData.gradeNumeric || "",
          game: normalizedData.game || normalizedData.gameSport || 
                (normalizedData.category?.toLowerCase().includes('pokemon') ? 'pokemon' : 
                 normalizedData.category?.toLowerCase().includes('magic') ? 'mtg' : ""),
          certNumber: normalizedData.certNumber || certInput.trim(),
          price: "",
          cost: "",
          quantity: 1,
          psaEstimate: normalizedData.psaEstimate || ""
        };

        setFormData(newFormData);

        // Count populated fields (excluding always-populated ones like certNumber, quantity)
        const populatedCount = Object.entries(newFormData).filter(([key, value]) => 
          value && value !== "" && key !== 'certNumber' && key !== 'quantity' && key !== 'cost' && key !== 'price' && key !== 'psaEstimate'
        ).length;
        setPopulatedFieldsCount(populatedCount);

        if (normalizedData.isValid) {
          toast.success(`${gradingCompany} certificate verified - ${populatedCount} fields populated`);
          logger.logInfo(`${gradingCompany} fetch successful`, { 
            certNumber: certInput.trim(), 
            fieldsPopulated: populatedCount,
            cardData: { subject: normalizedData.subject, grade: normalizedData.grade }
          });
        } else {
          toast.warning(`${gradingCompany} certificate found but may have incomplete data - ${populatedCount} fields populated`);
          logger.logWarn(`${gradingCompany} fetch returned incomplete data`, { 
            certNumber: certInput.trim(), 
            fieldsPopulated: populatedCount 
          });
        }
        
        // Show info if grade had non-numeric parts that were stripped
        if (gradeInfo.hasNonNumeric) {
          toast.info(`Grade "${gradeInfo.original}" converted to numeric: ${gradeInfo.numeric}`);
        }
      } else {
        const errorMsg = data?.error || `Invalid response from ${gradingCompany} service`;
        console.error(`${gradingCompany} fetch failed:`, errorMsg);
        logger.logError(`${gradingCompany} fetch failed`, new Error(errorMsg), { certNumber: certInput.trim() });
        
        // Show appropriate error message based on grading company
        if (gradingCompany === 'CGC') {
          if (errorMsg.includes('404') || errorMsg.includes('Not found')) {
            toast.error("CGC certification not found.");
          } else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('Unauthorized') || errorMsg.includes('Forbidden')) {
            toast.error("CGC token expired or invalid—please check credentials.");
          } else {
            toast.error("CGC lookup failed.");
          }
        } else {
          toast.error(`PSA fetch failed: ${errorMsg}`);
        }
      }
    } catch (error) {
      console.error(`${gradingCompany} fetch error:`, error);
      logger.logError(`${gradingCompany} fetch error`, error instanceof Error ? error : new Error(error?.message || 'Unknown error'), { certNumber: certInput.trim() });
      if (error?.message?.includes('timed out')) {
        toast.error(`${gradingCompany} fetch timed out - try again`);
      } else if (error?.message?.includes('cancelled')) {
        toast.info(`${gradingCompany} fetch cancelled`);
      } else {
        toast.error(error instanceof Error ? error.message : `Failed to fetch ${gradingCompany} data`);
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
      toast.info(`${gradingCompany} fetch cancelled`);
    }
  };

  const handleSubmit = async () => {
    if (!selectedStore || !selectedLocation) {
      toast.error("Please select a store and location before submitting");
      return;
    }

    // Ensure location belongs to the currently selected store
    const locValid = availableLocations.some(l => l.gid === selectedLocation);
    if (!locValid) {
      toast.error("Selected location doesn't belong to the selected store. Please reselect.");
      return;
    }

    // Preflight access check
    const hasAccess = await checkAccessAndShowToast();
    if (!hasAccess) {
      return;
    }

    if (!formData.certNumber) {
      toast.error("Please fetch PSA data first");
      return;
    }

    // Validate required fields
    if (!formData.grade) {
      toast.error("Grade is required");
      return;
    }

    if (!formData.price) {
      toast.error("Price is required");
      return;
    }

    if (!formData.cost) {
      toast.error("Cost is required");
      return;
    }

    // Validate numeric field limits (database precision 10, scale 2 = max 99,999,999.99)
    const maxValue = 99999999.99;
    const priceValue = parseFloat(formData.price);
    const costValue = parseFloat(formData.cost);
    
    if (priceValue > maxValue) {
      toast.error(`Price cannot exceed $${maxValue.toLocaleString()}`);
      return;
    }
    
    if (costValue > maxValue) {
      toast.error(`Cost cannot exceed $${maxValue.toLocaleString()}`);
      return;
    }

    setSubmitting(true);
    const startTime = Date.now();
    
    logger.logInfo("Intake item submission started", {
      store: selectedStore,
      location: selectedLocation,
      certNumber: formData.certNumber,
      price: formData.price,
      cost: formData.cost
    });
    
    console.log(`🚀 Adding item to batch - Started at ${new Date().toISOString()}`);

    try {
      const rpcParams = {
        store_key_in: selectedStore.trim(),
        shopify_location_gid_in: selectedLocation.trim(),
        quantity_in: formData.quantity,
        brand_title_in: formData.brandTitle,
        subject_in: formData.subject,
        category_in: formData.category,
        variant_in: formData.variant,
        card_number_in: formData.cardNumber,
        grade_in: formData.grade,
        price_in: formData.price ? parseFloat(formData.price) : 0,
        cost_in: formData.cost ? parseFloat(formData.cost) : null,
        sku_in: formData.certNumber, // Use cert number directly as SKU for graded cards
        source_provider_in: gradingCompany.toLowerCase(),
        catalog_snapshot_in: cardData,
        pricing_snapshot_in: {
          price: formData.price ? parseFloat(formData.price) : 0,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `Single graded card intake - ${gradingCompany} cert ${formData.certNumber}`
      };

      // Check exact access before insert
      console.log('🔧 Final values check:', {
        userId: (await supabase.auth.getSession()).data.session?.user.id,
        storeKey: selectedStore.trim(),
        locationGid: selectedLocation.trim(),
        rpcStoreKey: rpcParams.store_key_in,
        rpcLocationGid: rpcParams.shopify_location_gid_in
      });

      console.log('📤 Sending RPC request with params:', rpcParams);
      
      // Add timeout to the RPC call
      const rpcPromise = supabase.rpc('create_raw_intake_item', rpcParams);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
      });
      
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any;

      // If successful, also update the grading company specific fields
      if (!error && data) {
        const responseData = Array.isArray(data) ? data[0] : data;
        
        if (responseData?.id && gradingCompany === 'CGC') {
          // Update with CGC-specific fields
          await supabase
            .from('intake_items')
            .update({
              grading_company: 'CGC',
              cgc_cert: formData.certNumber,
              cgc_snapshot: cardData
            })
            .eq('id', responseData.id);
        } else if (responseData?.id && gradingCompany === 'PSA') {
          // Update with PSA-specific fields (ensure grading_company is set)
          await supabase
            .from('intake_items')
            .update({
              grading_company: 'PSA',
              psa_cert: formData.certNumber,
              psa_snapshot: cardData
            })
            .eq('id', responseData.id);
        }
      }

      const elapsed = Date.now() - startTime;
      console.log(`⏰ Database operation completed in ${elapsed}ms`);
      console.log('📥 RPC response:', { data, error });

      if (error) {
        console.error('❌ Database error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          fullError: error
        });
        
        // Enhanced error handling with detailed info for 42501 errors after preflight passed
        if (error.code === 'PGRST116' || error.code === '42501' || error.message?.toLowerCase().includes('row-level security')) {
          // Show detailed row data for comparison since preflight passed
          const { data: { session } } = await supabase.auth.getSession();
          toast.error(`Insert failed with 42501 despite preflight success. Row data: Store="${selectedStore}", Location="${selectedLocation}", User ID ending in "${session?.user.id?.slice(-6) || 'unknown'}"`, {
            duration: 10000
          });
          throw new Error('Access denied: RLS policy rejected the insert despite preflight checks passing.');
        }
        
        throw new Error(parseFunctionError(error));
      }

      const responseData = Array.isArray(data) ? data[0] : data;

      if (responseData?.id) {
        const lotNumber = responseData.lot_number;
        console.log(`✅ Item successfully added to batch: ${lotNumber} (ID: ${responseData.id})`);
        
        logger.logInfo("Intake item added successfully", {
          itemId: responseData.id,
          lotNumber: lotNumber,
          certNumber: formData.certNumber,
          store: selectedStore,
          location: selectedLocation,
          price: formData.price,
          processingTime: Date.now() - startTime
        });
        
        // Dispatch browser event for real-time updates
        window.dispatchEvent(new CustomEvent('intake:item-added', { detail: responseData }));
        
        // Call onBatchAdd callback to refresh parent components
        if (onBatchAdd) {
          onBatchAdd();
        }
        toast.success(`Added to batch ${lotNumber}!`);
        
        // Reset form on success
        setCertInput("");
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

        // Note: Shopify sync will happen later when items are moved from batch to inventory
        console.log(`📦 Item added to batch only - Shopify sync will occur during inventory processing`);
      } else {
        console.error('❌ Unexpected response format:', responseData);
        throw new Error('Invalid response format from server');
      }
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ Error saving item after ${elapsed}ms:`, {
        message: error.message,
        error: error
      });
      
      logger.logError("Intake item submission failed", 
        error instanceof Error ? error : new Error(error?.message || 'Unknown error'), {
        certNumber: formData.certNumber,
        store: selectedStore,
        location: selectedLocation,
        processingTime: elapsed,
        errorCode: error?.code,
        errorDetails: error?.details
      });
      
      const errorMessage = error?.message || 'Unknown error';
      if (errorMessage.includes('Access denied') || error?.code === 'PGRST116' || errorMessage.toLowerCase().includes('row-level security') || error?.code === '42501') {
        toast.error('Access denied: you do not have access to the selected store/location. Please ask an admin to assign access.');
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
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // Auto-calculate cost when price changes (70% of price)
      if (field === 'price' && value && typeof value === 'string' && value.trim() !== '') {
        const priceValue = parseFloat(value);
        if (!isNaN(priceValue) && priceValue > 0) {
          updated.cost = (Math.round(priceValue * 0.7 * 100) / 100).toString();
        }
      }
      
      return updated;
    });
  };

  // Enhanced preflight access check function using diagnostic RPC
  const checkAccessAndShowToast = async (): Promise<boolean> => {
    setAccessCheckLoading(true);
    setAccessResult(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        const errorMsg = "No user session found";
        toast.error(errorMsg);
        setAccessResult({ success: false, hasStaffRole: false, canAccessLocation: false, userId: "", error: errorMsg });
        return false;
      }

      if (!selectedStore || !selectedLocation) {
        const errorMsg = "Store and location must be selected";
        toast.error(errorMsg);
        setAccessResult({ success: false, hasStaffRole: false, canAccessLocation: false, userId: session.user.id, error: errorMsg });
        return false;
      }

      const userId = session.user.id;
      const userIdLast6 = userId.slice(-6);
      const storeKeyTrimmed = selectedStore.trim();
      const locationGidTrimmed = selectedLocation.trim();

      // Use the new diagnostic RPC for consolidated access check
      const { data: debugResult, error: debugError } = await supabase.rpc('debug_eval_intake_access', {
        _user_id: userId,
        _store_key: storeKeyTrimmed,
        _location_gid: locationGidTrimmed
      });

      if (debugError) {
        console.error('Access check error:', debugError);
        const errorMsg = `Access check failed: ${debugError.message}`;
        toast.error(errorMsg);
        setAccessResult({ success: false, hasStaffRole: false, canAccessLocation: false, userId, error: errorMsg });
        return false;
      }

      // Cast the debug result to proper type
      const result = debugResult as {
        user_id: string;
        store_key: string;
        location_gid: string;
        has_staff: boolean;
        can_access_location: boolean;
      };

      // Set result from diagnostic RPC
      setAccessResult({ 
        success: Boolean(result.can_access_location), 
        hasStaffRole: Boolean(result.has_staff), 
        canAccessLocation: Boolean(result.can_access_location), 
        userId 
      });

      // Show diagnostic toast with server truth
      toast.info(`Access Check: User ${userIdLast6} | Store: ${result.store_key} | Location: ${result.location_gid} | hasStaff: ${result.has_staff} | canAccessLocation: ${result.can_access_location}`, {
        duration: 5000
      });

      // Block if no access
      if (!result.can_access_location) {
        const errorMsg = `Access denied — you're not assigned to this store/location (${result.store_key}, ${result.location_gid}).`;
        toast.error(errorMsg);
        return false;
      }

      return true;
    } catch (error: any) {
      console.error('Preflight check error:', error);
      const errorMsg = `Preflight check failed: ${error.message}`;
      toast.error(errorMsg);
      setAccessResult({ success: false, hasStaffRole: false, canAccessLocation: false, userId: "", error: errorMsg });
      return false;
    } finally {
      setAccessCheckLoading(false);
    }
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
        {/* Store and Location Selector */}
        <div className="space-y-4">
          <StoreLocationSelector />
        </div>

        {/* Check Access Now Button */}
        {selectedStore && selectedLocation && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={checkAccessAndShowToast}
                disabled={accessCheckLoading}
                className="gap-2"
              >
                {accessCheckLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {accessCheckLoading ? "Checking..." : "Check Access Now"}
              </Button>
            </div>
            
            {/* Inline Access Result */}
            {accessResult && (
              <div className={`p-3 rounded-lg border text-sm ${
                accessResult.success 
                  ? 'bg-green-50 border-green-200 text-green-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {accessResult.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span className="font-medium">
                    {accessResult.success ? "Access Granted" : "Access Denied"}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div>User: {accessResult.userId.slice(-6)}</div>
                  <div>Staff Role: {accessResult.hasStaffRole ? "✓" : "✗"}</div>
                  <div>Location Access: {accessResult.canAccessLocation ? "✓" : "✗"}</div>
                  {accessResult.error && (
                    <div className="text-red-600 font-medium">{accessResult.error}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Grading Company Selector */}
        <div className="space-y-3">
          <Label htmlFor="grading-company">Grading Company</Label>
          <Select value={gradingCompany} onValueChange={(value: 'PSA' | 'CGC') => setGradingCompany(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PSA">PSA</SelectItem>
              <SelectItem value="CGC">CGC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Certificate Input */}
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Label htmlFor="cert-input">
              {gradingCompany === 'CGC' ? 'CGC Cert # or Barcode' : 'PSA Cert #'} to fetch details
            </Label>
            <Input
              id="cert-input"
              placeholder={gradingCompany === 'CGC' ? 'e.g., 12345678 or ABC123/DEF' : 'e.g., 12345678'}
              value={certInput}
              onChange={(e) => setCertInput(e.target.value)}
              disabled={fetching}
              onKeyDown={(e) => e.key === 'Enter' && !fetching && handleFetchCard()}
            />
            <p className="text-xs text-muted-foreground mt-1">
              SKU and barcode will be set to this {gradingCompany === 'CGC' ? 'certificate number' : 'certificate number'} on Shopify.
            </p>
          </div>
          
          {!fetching ? (
            <Button 
              onClick={handleFetchCard} 
              disabled={!certInput.trim()}
              className="px-8"
            >
              Fetch {gradingCompany}
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
        {cardData && (
          <div className="flex justify-center">
            {cardData.imageUrl ? (
              <img 
                src={cardData.imageUrl} 
                alt="PSA Card"
                className="max-w-xs max-h-80 object-contain rounded-lg border shadow-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="flex items-center justify-center w-48 h-32 bg-muted/50 rounded-lg border border-dashed">
                <div className="text-center text-muted-foreground">
                  <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No image available</p>
                  <p className="text-xs">PSA #{cardData.certNumber}</p>
                </div>
              </div>
            )}
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
            <Label htmlFor="grade">Grade (Number only) <span className="text-destructive">*</span></Label>
            <Input
              id="grade"
              type="number"
              min="1"
              max="10"
              step="0.5"
              placeholder="e.g., 10"
              value={formData.grade}
              onChange={(e) => updateFormField('grade', e.target.value)}
              className={!formData.grade ? "border-destructive/50" : ""}
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
            {formData.psaEstimate && (
              <p className="text-xs text-muted-foreground mt-1">
                PSA Estimate: ${formData.psaEstimate}
              </p>
            )}
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
        <div className="flex justify-end gap-2 pt-4">
          <Button 
            onClick={handleSubmit}
            disabled={submitting || !formData.certNumber || !formData.grade || !formData.price || !formData.cost}
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