import React, { useState, useEffect } from "react";
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
import { normalizePSAData } from "@/lib/psaNormalization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseFunctionError } from "@/lib/fns";
import { useLogger } from "@/hooks/useLogger";
import { validateCompleteStoreContext, logStoreContext } from "@/utils/storeValidation";
import { PSACertificateDisplay } from "@/components/PSACertificateDisplay";
import { CurrentBatchPanel } from "./CurrentBatchPanel";

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
  const [gradingCompany] = useState<'PSA'>('PSA'); // Simplified to PSA only
  const { assignedStore, selectedLocation } = useStore();

  // Form state
  const [certInput, setCertInput] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cardData, setCardData] = useState<any>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [populatedFieldsCount, setPopulatedFieldsCount] = useState(0);

  // Form fields that can be edited after fetching
  const [formData, setFormData] = useState({
    brandTitle: "",
    subject: "",
    category: "",
    variant: "",
    cardNumber: "",
    condition: "",
    year: "",
    certNumber: "",
    grade: "",
    price: "",
    cost: "",
    quantity: 1,
    psaEstimate: "",
    varietyPedigree: "",
  });

  // Auto-populate cert number when barcode is scanned/entered
  useEffect(() => {
    if (barcodeInput && !certInput) {
      setCertInput(barcodeInput);
      setFormData(prev => ({ ...prev, certNumber: barcodeInput }));
    }
  }, [barcodeInput, certInput]);

  // Auto-calculate cost as 70% of price
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
    const certNumber = certInput.trim();
    if (!certNumber) {
      toast.error("Please enter a certificate number");
      return;
    }

    // Cancel any existing fetch
    if (abortController) {
      abortController.abort();
    }

    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    try {
      setFetching(true);
      updateFormField('certNumber', certNumber);

      const { data, error } = await supabase.functions.invoke('psa-lookup', {
        body: { cert_number: certNumber }
      });

      if (newAbortController.signal.aborted) return;

      if (error) throw error;

      if (data && data.success) {
        const normalizedData = normalizePSAData(data.data);
        setCardData({ ...normalizedData, source: data.source });
        
        // Auto-populate form with fetched data
        setFormData(prev => ({
          ...prev,
          brandTitle: normalizedData.brandTitle || "",
          subject: normalizedData.subject || "",
          category: normalizedData.category || "",
          cardNumber: normalizedData.cardNumber || "",
          condition: "",
          year: normalizedData.year || "",
          grade: normalizedData.grade || "",
          varietyPedigree: normalizedData.varietyPedigree || "",
        }));

        toast.success("Card data fetched successfully!");
      } else {
        toast.error("No data found for this certificate number");
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error("Fetch error:", error);
      toast.error(`Failed to fetch card data: ${error.message}`);
    } finally {
      if (!newAbortController.signal.aborted) {
        setFetching(false);
        setAbortController(null);
      }
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

    if (!formData.certNumber || !formData.grade || !formData.condition || !formData.price || !formData.cost) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc("create_raw_intake_item", {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: `${formData.grade} (${formData.condition})`,
        brand_title_in: formData.brandTitle,
        subject_in: formData.subject,
        category_in: formData.category,
        variant_in: formData.variant,
        card_number_in: formData.cardNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: formData.certNumber, // Use PSA cert number as SKU
        catalog_snapshot_in: {
          ...cardData,
          psa_cert: formData.certNumber,
          year: formData.year,
          condition: formData.condition
        }
      });

      if (error) throw error;

      // Reset form
      setCertInput("");
      setBarcodeInput("");
      setCardData(null);
      setFormData({
        brandTitle: "",
        subject: "",
        category: "",
        variant: "",
        cardNumber: "",
        condition: "",
        year: "",
        certNumber: "",
        grade: "",
        price: "",
        cost: "",
        quantity: 1,
        psaEstimate: "",
        varietyPedigree: "",
      });

      toast.success("Card added to batch successfully!");
      
      if (onBatchAdd) {
        onBatchAdd();
      }

      // Dispatch event for batch panel to refresh
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

  const cancelFetch = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setFetching(false);
      toast.info(`PSA fetch cancelled`);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Graded Cards Intake
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Certificate Input Section */}
          <div className="space-y-3">
            <Label htmlFor="cert-input">Certificate Number</Label>
            <div className="flex gap-2">
              <Input
                id="cert-input"
                placeholder="Enter PSA certificate number"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFetchData();
                  }
                }}
                disabled={fetching}
              />
              <Button 
                onClick={handleFetchData}
                disabled={!certInput.trim() || fetching}
                size="default"
              >
                {fetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Fetching...
                  </>
                ) : (
                  'Fetch Data'
                )}
              </Button>
              {fetching && (
                <Button 
                  onClick={cancelFetch}
                  variant="outline" 
                  size="default"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {/* Barcode Scanner Input */}
          <div className="space-y-3">
            <Label htmlFor="barcode-input">Barcode Scanner</Label>
            <Input
              id="barcode-input"
              placeholder="Scan barcode here (auto-populates certificate number)"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              className="bg-yellow-50 border-yellow-200"
            />
          </div>

          {/* PSA Certificate Display */}
          {cardData && (
            <div className="space-y-3">
              <PSACertificateDisplay 
                psaData={cardData} 
                className="border-2 border-primary/20 bg-primary/5"
              />
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Label htmlFor="grade">Grade <span className="text-destructive">*</span></Label>
              <Input
                id="grade"
                placeholder="PSA grade (e.g., 10)"
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
              <Label htmlFor="condition">Condition</Label>
              <Select value={formData.condition} onValueChange={(value) => updateFormField('condition', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Near Mint">Near Mint</SelectItem>
                  <SelectItem value="Lightly Played">Lightly Played</SelectItem>
                  <SelectItem value="Moderately Played">Moderately Played</SelectItem>
                  <SelectItem value="Heavily Played">Heavily Played</SelectItem>
                  <SelectItem value="Damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
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
              onClick={handleSubmit}
              disabled={submitting || !formData.certNumber || !formData.grade || !formData.condition || !formData.price || !formData.cost}
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
      
      {/* Current Batch Panel */}
      <div className="max-w-4xl mx-auto">
        <CurrentBatchPanel />
      </div>
    </div>
  );
};