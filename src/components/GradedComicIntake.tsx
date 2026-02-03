import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, BookOpen, AlertCircle } from "lucide-react";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { useLogger } from "@/hooks/useLogger";
import { validateCompleteStoreContext, logStoreContext } from "@/utils/storeValidation";
import { CGCCertificateDisplay } from "@/components/CGCCertificateDisplay";
import { PSACertificateDisplay } from "@/components/PSACertificateDisplay";
import { useDebounce } from "@/hooks/useDebounce";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CGCCertificateData } from "@/types/cgc";
import type { PSACertificateData } from "@/types/psa";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

interface GradedComicIntakeProps {
  onBatchAdd?: () => void;
}

export const GradedComicIntake = ({ onBatchAdd }: GradedComicIntakeProps = {}) => {
  const { validateAccess, assignedStore, selectedLocation } = useIntakeValidation();
  const logger = useLogger('GradedComicIntake');
  const { mutateAsync: addItem, isPending: isAdding } = useAddIntakeItem();

  const [gradingService, setGradingService] = useState<'psa' | 'cgc'>('cgc');
  const [certInput, setCertInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [cgcData, setCgcData] = useState<CGCCertificateData | null>(null);
  const [psaData, setPsaData] = useState<PSACertificateData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debouncedBarcode = useDebounce(barcodeInput, 250);

  const [formData, setFormData] = useState({
    title: "",
    issueNumber: "",
    publisher: "",
    year: "",
    certNumber: "",
    grade: "",
    price: "",
    cost: "",
    quantity: 1,
    mainCategory: "comics"
  });

  const sanitizeCertNumber = (input: string): string => {
    return input.replace(/\D+/g, '').slice(0, 12);
  };

  // Auto-populate and auto-fetch when barcode is scanned
  useEffect(() => {
    if (debouncedBarcode && debouncedBarcode !== certInput) {
      const sanitized = sanitizeCertNumber(debouncedBarcode);
      setCertInput(sanitized);
      setFormData(prev => ({ ...prev, certNumber: sanitized }));
      setBarcodeInput("");
      // Auto-fetch after barcode scan
      if (sanitized.length >= 6) {
        setTimeout(() => {
          handleFetchData();
        }, 100);
      }
    }
  }, [debouncedBarcode]);

  useEffect(() => {
    if (certInput) {
      setFormData(prev => ({ ...prev, certNumber: certInput }));
    }
  }, [certInput]);

  useEffect(() => {
    if (formData.price && !isNaN(parseFloat(formData.price))) {
      const price = parseFloat(formData.price);
      const calculatedCost = (price * 0.7).toFixed(2);
      setFormData(prev => ({ ...prev, cost: calculatedCost }));
    }
  }, [formData.price]);

  // Reset form when grading service changes
  useEffect(() => {
    setCgcData(null);
    setPsaData(null);
    setFetchState('idle');
    setError(null);
    setCertInput("");
    setBarcodeInput("");
    setFormData({
      title: "",
      issueNumber: "",
      publisher: "",
      year: "",
      certNumber: "",
      grade: "",
      price: "",
      cost: "",
      quantity: 1,
      mainCategory: "comics"
    });
  }, [gradingService]);

  const updateFormField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFetchData = async () => {
    const certNumber = sanitizeCertNumber(certInput.trim());
    
    setFetchState('loading');
    setError(null);
    setCgcData(null);
    setPsaData(null);

    try {
      updateFormField('certNumber', certNumber);

      if (gradingService === 'psa') {
        logger.logInfo('Looking up PSA cert', { certNumber });

        const { data, error: invokeError } = await supabase.functions.invoke('psa-lookup', {
          body: { cert_number: certNumber }
        });

        logger.logDebug('PSA lookup response', { hasData: !!data, hasError: !!invokeError });

        if (invokeError) {
          throw new Error(invokeError.message || 'Failed to invoke PSA lookup function');
        }

        if (!data) {
          throw new Error('No response from PSA lookup service');
        }

        if (!data.ok) {
          if (data.error === 'NO_DATA') {
            setFetchState('empty');
            setError('Certificate not found in PSA database.');
            toast.info('Certificate not found.');
            return;
          }
          setFetchState('error');
          setError(data.error || 'Unknown error occurred');
          toast.error(data.error || 'Failed to fetch comic data');
          return;
        }

        const psaCertData = data.data;
        logger.logInfo('PSA data found', { subject: psaCertData.subject, grade: psaCertData.grade });
        setPsaData(psaCertData);
        
        // Map PSA fields to comic fields
        setFormData(prev => ({
          ...prev,
          title: psaCertData.subject || "",
          issueNumber: psaCertData.cardNumber || "",
          publisher: psaCertData.brandTitle || "",
          year: psaCertData.year || "",
          grade: psaCertData.grade || "",
        }));

        setFetchState('success');
        toast.success("PSA comic data fetched successfully!");
      } else {
        // CGC lookup
        logger.logInfo('Looking up CGC cert', { certNumber });

        const { data, error: invokeError } = await supabase.functions.invoke('cgc-lookup', {
          body: { certNumber }
        });

        logger.logDebug('CGC lookup response', { hasData: !!data, hasError: !!invokeError });

        if (invokeError) {
          throw new Error(invokeError.message || 'Failed to invoke CGC lookup function');
        }

        if (!data) {
          throw new Error('No response from CGC lookup service');
        }

        if (!data.ok) {
          setFetchState('error');
          setError(data.error || 'Unknown error occurred');
          toast.error(data.error || 'Failed to fetch comic data');
          return;
        }

        if (!data.data || !data.data.isValid) {
          setFetchState('empty');
          setError('Invalid or not found certificate.');
          toast.info('Certificate not found or invalid.');
          return;
        }

        const cgcCertData = data.data;
        logger.logInfo('CGC data found', { title: cgcCertData.title, grade: cgcCertData.grade });
        setCgcData(cgcCertData);
        
        setFormData(prev => ({
          ...prev,
          title: cgcCertData.title || "",
          issueNumber: cgcCertData.issueNumber || "",
          publisher: cgcCertData.publisher || cgcCertData.seriesName || "",
          year: cgcCertData.year?.toString() || "",
          grade: cgcCertData.grade || "",
        }));

        setFetchState('success');
        toast.success("CGC comic data fetched successfully!");
      }
    } catch (error: any) {
      setFetchState('error');
      const errorMsg = error.message || 'Could not reach server.';
      setError(errorMsg);
      toast.error(errorMsg);
    }
  };

  const handleSubmit = async () => {
    try {
      validateCompleteStoreContext(
        { assignedStore, selectedLocation }, 
        'submit graded comic intake'
      );
      
      logStoreContext('GradedComicIntake', { assignedStore, selectedLocation }, { 
        certNumber: formData.certNumber,
        price: formData.price 
      });
    } catch (error: any) {
      toast.error(error.message);
      return;
    }

    if (!formData.title || !formData.certNumber || !formData.grade || !formData.price || !formData.cost) {
      toast.error("Please fill in all required fields (Title, Cert #, Grade, Price, Cost)");
      return;
    }

    try {
      const catalogSnapshot = gradingService === 'psa' 
        ? {
            ...psaData,
            psa_cert: formData.certNumber,
            grading_company: 'PSA',
            type: 'psa_comic',
            year: formData.year
          }
        : {
            ...cgcData,
            cgc_cert: formData.certNumber,
            grading_company: 'CGC',
            type: 'cgc_comic',
            year: formData.year
          };

      // Build variant: include variety if available (from CGC or PSA), then grading info
      const varietyPart = gradingService === 'psa' 
        ? (psaData?.varietyPedigree || '') 
        : (cgcData?.variety || '');
      const gradePart = `${gradingService.toUpperCase()} ${formData.grade}`;
      const variant = varietyPart ? `${varietyPart} ${gradePart}` : gradePart;
      const titleWithVariant = `${formData.title} ${variant}`.trim();

      await addItem({
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: formData.grade,
        brand_title_in: formData.publisher,
        subject_in: titleWithVariant,
        category_in: formData.publisher || "Comics",
        variant_in: variant,
        card_number_in: formData.issueNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: formData.certNumber,
        main_category_in: formData.mainCategory,
        sub_category_in: 'graded_comics',
        year_in: formData.year || null,
        catalog_snapshot_in: catalogSnapshot
      });

      setCertInput("");
      setBarcodeInput("");
      setCgcData(null);
      setPsaData(null);
      setFormData({
        title: "",
        issueNumber: "",
        publisher: "",
        year: "",
        certNumber: "",
        grade: "",
        price: "",
        cost: "",
        quantity: 1,
        mainCategory: "comics"
      });
      
      if (onBatchAdd) {
        onBatchAdd();
      }

    } catch (error: any) {
      logger.logError("Submit error", error instanceof Error ? error : new Error(String(error)), { certNumber: formData.certNumber });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Graded Comics Intake ({gradingService.toUpperCase()})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Grading Service Toggle */}
          <div className="space-y-2">
            <Label>Grading Service</Label>
            <RadioGroup
              value={gradingService}
              onValueChange={(value: 'psa' | 'cgc') => setGradingService(value)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="psa" id="psa-comic" />
                <Label htmlFor="psa-comic" className="cursor-pointer font-normal">PSA</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cgc" id="cgc-comic" />
                <Label htmlFor="cgc-comic" className="cursor-pointer font-normal">CGC</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cert-input">{gradingService.toUpperCase()} Certificate Number</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="cert-input"
                  placeholder={`Enter ${gradingService.toUpperCase()} certificate number (digits only)`}
                  value={certInput}
                  onChange={(e) => {
                    const sanitized = sanitizeCertNumber(e.target.value);
                    setCertInput(sanitized);
                    if (error) setError(null);
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
              <Button 
                type="button"
                onClick={handleFetchData}
                disabled={fetchState === 'loading'}
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
          </div>

          {fetchState === 'success' && gradingService === 'cgc' && cgcData && (
            <div className="space-y-3">
              <CGCCertificateDisplay 
                cgcData={cgcData} 
                className="border-2 border-primary/20 bg-primary/5"
              />
            </div>
          )}

          {fetchState === 'success' && gradingService === 'psa' && psaData && (
            <div className="space-y-3">
              <PSACertificateDisplay 
                psaData={psaData} 
                className="border-2 border-primary/20 bg-primary/5"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="title"
                placeholder="Comic title"
                value={formData.title}
                onChange={(e) => updateFormField('title', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="issueNumber">Issue Number</Label>
              <Input
                id="issueNumber"
                placeholder="Issue #"
                value={formData.issueNumber}
                onChange={(e) => updateFormField('issueNumber', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="publisher">Publisher</Label>
              <Input
                id="publisher"
                placeholder="Publisher"
                value={formData.publisher}
                onChange={(e) => updateFormField('publisher', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="grade">Grade <span className="text-destructive">*</span></Label>
              <Input
                id="grade"
                placeholder="CGC Grade"
                value={formData.grade}
                onChange={(e) => updateFormField('grade', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="price">Price <span className="text-destructive">*</span></Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                placeholder="Selling price"
                value={formData.price}
                onChange={(e) => updateFormField('price', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="cost">Cost (70% auto) <span className="text-destructive">*</span></Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                placeholder="Cost"
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


          <Button 
            onClick={handleSubmit} 
            disabled={isAdding || fetchState === 'loading'}
            className="w-full"
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Adding to Batch...
              </>
            ) : (
              'Add to Batch'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
