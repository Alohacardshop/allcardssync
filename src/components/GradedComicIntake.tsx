import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, BookOpen, AlertCircle } from "lucide-react";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { useLogger } from "@/hooks/useLogger";
import { validateCompleteStoreContext, logStoreContext } from "@/utils/storeValidation";
import { CGCCertificateDisplay } from "@/components/CGCCertificateDisplay";
import { useDebounce } from "@/hooks/useDebounce";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CGCCertificateData } from "@/types/cgc";

interface GradedComicIntakeProps {
  onBatchAdd?: () => void;
}

export const GradedComicIntake = ({ onBatchAdd }: GradedComicIntakeProps = {}) => {
  const { validateAccess, assignedStore, selectedLocation } = useIntakeValidation();
  const logger = useLogger('GradedComicIntake');

  const [certInput, setCertInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [comicData, setComicData] = useState<CGCCertificateData | null>(null);
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
    mainCategory: "comics",
  });

  const sanitizeCertNumber = (input: string): string => {
    return input.replace(/\D+/g, '').slice(0, 12);
  };

  useEffect(() => {
    if (debouncedBarcode && debouncedBarcode !== certInput) {
      const sanitized = sanitizeCertNumber(debouncedBarcode);
      setCertInput(sanitized);
      setFormData(prev => ({ ...prev, certNumber: sanitized }));
      setBarcodeInput("");
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

  const updateFormField = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFetchData = async () => {
    const certNumber = sanitizeCertNumber(certInput.trim());
    
    setFetchState('loading');
    setError(null);
    setComicData(null);

    try {
      updateFormField('certNumber', certNumber);

      console.log('[GradedComicIntake] Looking up CGC cert:', certNumber);

      const { data, error: invokeError } = await supabase.functions.invoke('cgc-lookup', {
        body: { 
          certNumber
        }
      });

      console.log('[GradedComicIntake] CGC lookup response:', { data, error: invokeError });

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

      const cgcData = data.data;
      console.log('[GradedComicIntake] CGC data found:', cgcData);
      setComicData(cgcData);
      
      setFormData(prev => ({
        ...prev,
        title: cgcData.title || "",
        issueNumber: cgcData.issueNumber || "",
        publisher: cgcData.publisher || cgcData.seriesName || "",
        year: cgcData.year?.toString() || "",
        grade: cgcData.grade || "",
      }));

      setFetchState('success');
      toast.success("Comic data fetched successfully!");
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

    if (!formData.certNumber || !formData.grade || !formData.price || !formData.cost) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc("create_raw_intake_item", {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: formData.grade,
        brand_title_in: formData.publisher,
        subject_in: formData.title,
        category_in: "Comics",
        variant_in: `CGC ${formData.grade}`,
        card_number_in: formData.issueNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: formData.certNumber,
        main_category_in: formData.mainCategory,
        catalog_snapshot_in: {
          ...comicData,
          cgc_cert: formData.certNumber,
          type: 'cgc_comic'
        }
      });

      if (error) throw error;

      setCertInput("");
      setBarcodeInput("");
      setComicData(null);
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
        mainCategory: "comics",
      });

      toast.success("Comic added to batch successfully!");
      
      if (onBatchAdd) {
        onBatchAdd();
      }

      const item = Array.isArray(data) ? data[0] : data;
      window.dispatchEvent(new CustomEvent('batchItemAdded', {
        detail: { 
          itemId: item.id,
          lot: item.lot_number,
          store: assignedStore,
          location: selectedLocation
        }
      }));

    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(`Failed to add to batch: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Graded Comics Intake (CGC)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cert-input">CGC Certificate Number</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  id="cert-input"
                  placeholder="Enter CGC certificate number (digits only)"
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

          {fetchState === 'success' && comicData && (
            <div className="space-y-3">
              <CGCCertificateDisplay 
                cgcData={comicData} 
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
            disabled={submitting || fetchState === 'loading'}
            className="w-full"
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
        </CardContent>
      </Card>
    </div>
  );
};
