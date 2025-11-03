import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Package, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { generateTCGSKU } from "@/lib/sku";
import { manualRawCardSchema } from "@/lib/validation/intake-schemas";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

interface ManualRawCardEntryProps {
  onBatchAdd?: (item: any) => void;
}

const CONDITION_OPTIONS = [
  { value: "not_specified", label: "Not specified" },
  { value: "Near Mint", label: "Near Mint (NM)" },
  { value: "Lightly Played", label: "Lightly Played (LP)" },
  { value: "Moderately Played", label: "Moderately Played (MP)" },
  { value: "Heavily Played", label: "Heavily Played (HP)" },
  { value: "Damaged", label: "Damaged" },
];

export const ManualRawCardEntry: React.FC<ManualRawCardEntryProps> = ({ onBatchAdd }) => {
  const { assignedStore, selectedLocation, validateAccess } = useIntakeValidation();
  const { mutate: addItem, isPending } = useAddIntakeItem();
  
  const [formData, setFormData] = useState({
    mainCategory: "tcg",
    subCategory: "",
    brand: "",
    subject: "",
    cardNumber: "",
    year: "",
    condition: "not_specified",
    variation: "",
    numberedBox: "",
    gradingCompany: "",
    grade: "",
    price: "",
    cost: "",
    quantity: 1,
    vendor: "",
  });
  
  const [costPercentage, setCostPercentage] = useState(70);
  const [vendors, setVendors] = useState<string[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [quickEntry, setQuickEntry] = useState("");

  // Load vendors when store changes
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
        
        const vendorList = data?.map(v => v.vendor_name) || [];
        setVendors(vendorList);
        
        // Auto-select default vendor if available
        const defaultVendor = data?.find(v => v.is_default)?.vendor_name;
        if (defaultVendor && !formData.vendor) {
          setFormData(prev => ({ ...prev, vendor: defaultVendor }));
        }
      } catch (error: any) {
        console.error('Failed to load vendors:', error);
      } finally {
        setLoadingVendors(false);
      }
    };

    loadVendors();
  }, [assignedStore]);

  // Auto-detect main category from brand
  useEffect(() => {
    if (formData.brand.trim()) {
      const detected = detectMainCategory(formData.brand);
      if (detected !== formData.mainCategory) {
        setFormData(prev => ({ 
          ...prev, 
          mainCategory: detected,
          subCategory: "" // Reset sub-category when main category changes
        }));
      }
    }
  }, [formData.brand]);

  // Auto-calculate cost from price and percentage
  useEffect(() => {
    if (formData.price) {
      const priceNum = parseFloat(formData.price);
      if (!isNaN(priceNum)) {
        const calculatedCost = (priceNum * costPercentage / 100).toFixed(2);
        setFormData(prev => ({ ...prev, cost: calculatedCost }));
      }
    }
  }, [formData.price, costPercentage]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ 
      ...prev, 
      [field]: value,
      // Reset sub-category when main category changes
      ...(field === 'mainCategory' ? { subCategory: '' } : {})
    }));
  };

  const parseQuickEntry = (text: string) => {
    if (!text.trim()) return;

    // Match pattern: Year Brand/Set CardName Variation /Number
    // Example: "2024 National Treasures Alexandre Sarr Patch /49"
    
    // Extract year (4 digits at start)
    const yearMatch = text.match(/^(\d{4})\s+/);
    const year = yearMatch ? yearMatch[1] : "";
    let remaining = year ? text.slice(yearMatch[0].length) : text;

    // Extract numbered (/XX at end)
    const numberedMatch = remaining.match(/\s+(\/\d+)\s*$/);
    const numbered = numberedMatch ? numberedMatch[1] : "";
    remaining = numbered ? remaining.slice(0, -numberedMatch[0].length) : remaining;

    // Split remaining into parts
    const parts = remaining.trim().split(/\s+/);
    
    if (parts.length >= 2) {
      // First 1-2 words are likely brand/set
      const brandParts = parts.slice(0, 2);
      const brand = brandParts.join(" ");
      
      // Rest is card name and possibly variation
      const nameParts = parts.slice(2);
      
      // Check if last word is a common variation type
      const commonVariations = ["Patch", "Auto", "Autograph", "Jersey", "Relic", "Holo", "Foil", "Refractor"];
      let variation = "";
      let subject = nameParts.join(" ");
      
      if (nameParts.length > 0) {
        const lastWord = nameParts[nameParts.length - 1];
        if (commonVariations.some(v => v.toLowerCase() === lastWord.toLowerCase())) {
          variation = lastWord;
          subject = nameParts.slice(0, -1).join(" ");
        }
      }

      setFormData(prev => ({
        ...prev,
        year: year || prev.year,
        brand: brand || prev.brand,
        subject: subject || prev.subject,
        variation: variation || prev.variation,
        numberedBox: numbered || prev.numberedBox,
      }));

      setQuickEntry("");
      toast.success("Card info parsed successfully!");
    } else {
      toast.error("Could not parse entry. Format: Year Brand CardName Variation /Number");
    }
  };

  const handleSubmit = async () => {
    try {
      await validateAccess();
      
      // Validate form data
      const validation = manualRawCardSchema.safeParse(formData);
      if (!validation.success) {
        const firstError = validation.error.errors[0];
        toast.error(firstError.message);
        return;
      }
      
      // Generate SKU
      const generatedSku = generateTCGSKU(
        null,
        'pokemon',
        null,
        `${formData.brand}-${formData.subject}-${formData.cardNumber || 'unknown'}`.replace(/\s+/g, '-').toLowerCase()
      );

      const itemPayload: any = {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        brand_title_in: formData.brand || null,
        subject_in: formData.subject || null,
        category_in: formData.subCategory || null,
        variant_in: formData.condition === "not_specified" ? "Raw" : formData.condition,
        card_number_in: formData.cardNumber || null,
        grade_in: formData.grade || null,
        price_in: parseFloat(formData.price),
        cost_in: formData.cost ? parseFloat(formData.cost) : null,
        sku_in: generatedSku,
        source_provider_in: 'manual',
        processing_notes_in: formData.variation || null,
        main_category_in: formData.mainCategory,
        sub_category_in: formData.subCategory,
        catalog_snapshot_in: {
          type: "manual_raw_card",
          brand: formData.brand,
          subject: formData.subject,
          card_number: formData.cardNumber,
          condition: formData.condition,
          variation: formData.variation,
          numbered_box: formData.numberedBox,
          grading_company: formData.gradingCompany,
          grade: formData.grade,
          year: formData.year,
          entry_method: "manual"
        }
      };

      addItem(itemPayload, {
        onSuccess: async (data) => {
          // Update vendor if selected
          if (formData.vendor && formData.vendor !== "no_vendor") {
            await supabase
              .from('intake_items')
              .update({ vendor: formData.vendor })
              .eq('id', data.id);
          }
          
          // Reset form but keep vendor selection
          const vendorToKeep = formData.vendor;
          setFormData({
            mainCategory: "tcg",
            subCategory: "",
            brand: "",
            subject: "",
            cardNumber: "",
            year: "",
            condition: "not_specified",
            variation: "",
            numberedBox: "",
            gradingCompany: "",
            grade: "",
            price: "",
            cost: "",
            quantity: 1,
            vendor: vendorToKeep,
          });
          
          if (onBatchAdd) {
            onBatchAdd(data);
          }
        }
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to add item');
    }
  };

  const handleClear = () => {
    setFormData({
      mainCategory: "tcg",
      subCategory: "",
      brand: "",
      subject: "",
      cardNumber: "",
      year: "",
      condition: "not_specified",
      variation: "",
      numberedBox: "",
      gradingCompany: "",
      grade: "",
      price: "",
      cost: "",
      quantity: 1,
      vendor: formData.vendor, // Keep the vendor selection
    });
    setQuickEntry("");
    setCostPercentage(70);
    toast.success("Form cleared");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Manual Raw Card Entry</CardTitle>
        </div>
        <CardDescription>
          Manually enter raw trading card details for inventory intake
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Entry Field */}
        <div className="space-y-2">
          <Label htmlFor="quickEntry">Quick Entry (Optional)</Label>
          <div className="flex gap-2">
            <Input
              id="quickEntry"
              value={quickEntry}
              onChange={(e) => setQuickEntry(e.target.value)}
              placeholder="Paste card info: 2024 National Treasures Alexandre Sarr Patch /49"
              className="flex-1"
            />
            <Button 
              type="button"
              onClick={() => parseQuickEntry(quickEntry)}
              variant="secondary"
            >
              Parse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste a full card description and click Parse to auto-fill fields below
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="mainCategory">Main Category *</Label>
            <Select value={formData.mainCategory} onValueChange={(value) => handleInputChange('mainCategory', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tcg">🃏 TCG (Trading Card Games)</SelectItem>
                <SelectItem value="sports">⚾ Sports Cards</SelectItem>
                <SelectItem value="comics">📚 Comics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subCategory">Sub-Category *</Label>
            <SubCategoryCombobox
              mainCategory={formData.mainCategory}
              value={formData.subCategory}
              onChange={(value) => handleInputChange('subCategory', value)}
            />
          </div>

          <div>
            <Label htmlFor="brand">Brand/Set</Label>
            <Input
              id="brand"
              value={formData.brand}
              onChange={(e) => handleInputChange('brand', e.target.value)}
              placeholder="e.g., Pokemon Base Set, Upper Deck"
            />
          </div>

          <div>
            <Label htmlFor="subject">Card Name</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => handleInputChange('subject', e.target.value)}
              placeholder="e.g., Charizard, Pikachu"
            />
          </div>

          <div>
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input
              id="cardNumber"
              value={formData.cardNumber}
              onChange={(e) => handleInputChange('cardNumber', e.target.value)}
              placeholder="e.g., 4/102"
            />
          </div>

          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              value={formData.year}
              onChange={(e) => handleInputChange('year', e.target.value)}
              placeholder="e.g., 1999, 2024"
            />
          </div>

          <div>
            <Label htmlFor="variation">Variation</Label>
            <Input
              id="variation"
              value={formData.variation}
              onChange={(e) => handleInputChange('variation', e.target.value)}
              placeholder="e.g., Holo, Reverse Holo"
            />
          </div>

          <div>
            <Label htmlFor="numberedBox">Numbered</Label>
            <Input
              id="numberedBox"
              value={formData.numberedBox}
              onChange={(e) => handleInputChange('numberedBox', e.target.value)}
              placeholder="e.g., /25, /50"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="condition">Condition</Label>
            <Select value={formData.condition} onValueChange={(value) => handleInputChange('condition', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {CONDITION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="gradingCompany">Grading Company</Label>
            <Select value={formData.gradingCompany} onValueChange={(value) => handleInputChange('gradingCompany', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="PSA">PSA</SelectItem>
                <SelectItem value="CGC">CGC</SelectItem>
                <SelectItem value="BGS">BGS</SelectItem>
                <SelectItem value="SGC">SGC</SelectItem>
                <SelectItem value="MISC">MISC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="grade">Grade</Label>
            <Input
              id="grade"
              value={formData.grade}
              onChange={(e) => handleInputChange('grade', e.target.value)}
              placeholder="e.g., 10, 9.5, 8"
            />
          </div>

          <div>
            <Label htmlFor="price">Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div>
            <Label htmlFor="costPercentage">Cost % of Price</Label>
            <Input
              id="costPercentage"
              type="number"
              value={costPercentage}
              onChange={(e) => setCostPercentage(parseInt(e.target.value) || 70)}
              placeholder="70"
            />
          </div>

          <div>
            <Label htmlFor="cost">Cost</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => handleInputChange('cost', e.target.value)}
              placeholder="Auto-calculated"
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
              min={1}
            />
          </div>

          <div>
            <Label htmlFor="vendor">Vendor</Label>
            <Select 
              value={formData.vendor} 
              onValueChange={(value) => handleInputChange('vendor', value)}
              disabled={loadingVendors}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingVendors ? "Loading..." : "Select vendor"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_vendor">No vendor</SelectItem>
                {vendors.map(vendor => (
                  <SelectItem key={vendor} value={vendor}>{vendor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

        <div className="space-y-2">
          <Button
            onClick={handleSubmit} 
            disabled={isPending}
            className="w-full"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to Batch
          </Button>
          
          <Button
            onClick={handleClear}
            variant="outline"
            className="w-full"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear Form
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
