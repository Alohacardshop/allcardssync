import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStore } from "@/contexts/StoreContext";
import { Upload, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import { rawComicSchema } from "@/lib/validation/comic-schemas";
import { z } from "zod";
import { parseClzComicsCsv, ClzComic } from "@/lib/csv/parseClzComics";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { useLogger } from "@/hooks/useLogger";

interface RawComicIntakeProps {
  onBatchAdd?: (item: any) => void;
}

export const RawComicIntake = ({ onBatchAdd }: RawComicIntakeProps) => {
  const { assignedStore, selectedLocation } = useStore();
  const logger = useLogger('RawComicIntake');
  
  const [formData, setFormData] = useState({
    title: "",
    issueNumber: "",
    publisher: "",
    year: "",
    condition: "",
    price: "",
    cost: "",
    quantity: 1,
    processingNotes: "",
    subCategory: "american"
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [uploadedComics, setUploadedComics] = useState<ClzComic[]>([]);
  const [currentComicIndex, setCurrentComicIndex] = useState(0);

  // Auto-calculate cost from price (70% of price)
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseClzComicsCsv(text);

      if (parsed.errors.length > 0) {
        toast.error(`CSV parsing errors: ${parsed.errors.length} rows failed`);
      }

      if (parsed.comics.length === 0) {
        toast.error("No valid comics found in CSV");
        return;
      }

      setUploadedComics(parsed.comics);
      setCurrentComicIndex(0);
      
      // Auto-populate form with first comic
      const firstComic = parsed.comics[0];
      populateFormFromClzComic(firstComic);
      
      toast.success(`Loaded ${parsed.comics.length} comics from CSV`);
    };
    
    reader.readAsText(file);
  };

  const populateFormFromClzComic = (comic: ClzComic) => {
    // Extract year from release date
    const yearMatch = comic.releaseDate.match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : "";

    // Build title with variant
    const fullTitle = comic.variantDescription 
      ? `${comic.series} (${comic.variantDescription})`
      : comic.series;

    setFormData({
      title: fullTitle,
      issueNumber: comic.issue,
      publisher: comic.publisher,
      year,
      condition: "",
      price: "",
      cost: "",
      quantity: 1,
      processingNotes: comic.variantDescription ? `Variant: ${comic.variantDescription}` : "",
      subCategory: "american"
    });
  };

  const handleNextComic = () => {
    if (currentComicIndex < uploadedComics.length - 1) {
      const nextIndex = currentComicIndex + 1;
      setCurrentComicIndex(nextIndex);
      populateFormFromClzComic(uploadedComics[nextIndex]);
    }
  };

  const handlePreviousComic = () => {
    if (currentComicIndex > 0) {
      const prevIndex = currentComicIndex - 1;
      setCurrentComicIndex(prevIndex);
      populateFormFromClzComic(uploadedComics[prevIndex]);
    }
  };

  const handleSubmit = async () => {
    // Validate required fields
    if (!assignedStore || !selectedLocation) {
      toast.error("Please select a store and location first");
      return;
    }

    if (!formData.title || !formData.price || !formData.cost || !formData.subCategory) {
      toast.error("Please fill in all required fields (Title, Price, Cost, Sub-Category)");
      return;
    }

    // Validate with schema
    try {
      rawComicSchema.parse({
        title: formData.title,
        issueNumber: formData.issueNumber,
        publisher: formData.publisher,
        year: formData.year,
        condition: formData.condition,
        price: formData.price,
        cost: formData.cost,
        quantity: formData.quantity,
        mainCategory: 'comics',
        subCategory: formData.subCategory,
        processingNotes: formData.processingNotes
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }

    try {
      setSubmitting(true);

      const { data, error } = await supabase.rpc("create_raw_intake_item", {
        store_key_in: assignedStore,
        shopify_location_gid_in: selectedLocation,
        quantity_in: formData.quantity,
        grade_in: null,
        brand_title_in: formData.publisher,
        subject_in: formData.title,
        category_in: "Comics",
        variant_in: formData.condition,
        card_number_in: formData.issueNumber,
        price_in: parseFloat(formData.price),
        cost_in: parseFloat(formData.cost),
        sku_in: "",
        main_category_in: "comics",
        sub_category_in: formData.subCategory,
        processing_notes_in: formData.processingNotes,
        catalog_snapshot_in: {
          title: formData.title,
          issueNumber: formData.issueNumber,
          publisher: formData.publisher,
          year: formData.year,
          condition: formData.condition,
          type: 'raw_comic',
          source: 'clz_csv'
        }
      });

      if (error) throw error;

      toast.success("Comic added to batch successfully!");

      // Move to next comic if available, otherwise reset
      if (uploadedComics.length > 0 && currentComicIndex < uploadedComics.length - 1) {
        handleNextComic();
      } else {
        setFormData({
          title: "",
          issueNumber: "",
          publisher: "",
          year: "",
          condition: "",
          price: "",
          cost: "",
          quantity: 1,
          processingNotes: "",
          subCategory: "american"
        });
        setUploadedComics([]);
        setCurrentComicIndex(0);
      }

      if (onBatchAdd) {
        onBatchAdd(data);
      }

      const item = Array.isArray(data) ? data[0] : data;
      window.dispatchEvent(new CustomEvent('batchItemAdded', {
        detail: { 
          itemId: item?.id,
          lot: item?.lot_number,
          store: assignedStore,
          location: selectedLocation
        }
      }));

    } catch (error: any) {
      logger.logError('Failed to add comic to batch', error instanceof Error ? error : undefined, {
        title: formData.title,
      })
      toast.error(`Failed to add to batch: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Raw Comic Book Intake - CLZ Import</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CSV Upload Section */}
        <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
          <Input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="csv-upload"
          />
          <Label htmlFor="csv-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                Upload CLZ Comics CSV Export
              </div>
              {uploadedComics.length > 0 && (
                <div className="text-xs text-green-600 font-medium mt-2">
                  {uploadedComics.length} comics loaded • Comic {currentComicIndex + 1} of {uploadedComics.length}
                </div>
              )}
            </div>
          </Label>
        </div>

        {/* Navigation buttons */}
        {uploadedComics.length > 0 && (
          <div className="flex gap-2 justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreviousComic}
              disabled={currentComicIndex === 0}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNextComic}
              disabled={currentComicIndex === uploadedComics.length - 1}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="publisher">Publisher</Label>
            <Input
              id="publisher"
              value={formData.publisher}
              onChange={(e) => updateFormField("publisher", e.target.value)}
              placeholder="e.g., Marvel Comics"
            />
          </div>

          <div>
            <Label htmlFor="subCategory">Sub-Category <span className="text-destructive">*</span></Label>
            <SubCategoryCombobox
              mainCategory="comics"
              value={formData.subCategory}
              onChange={(value) => updateFormField("subCategory", value)}
            />
          </div>

          <div>
            <Label htmlFor="issueNumber">Issue Number</Label>
            <Input
              id="issueNumber"
              value={formData.issueNumber}
              onChange={(e) => updateFormField("issueNumber", e.target.value)}
              placeholder="e.g., 1A"
            />
          </div>

          <div>
            <Label htmlFor="title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => updateFormField("title", e.target.value)}
              placeholder="Comic title"
              required
            />
          </div>

          <div>
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              value={formData.year}
              onChange={(e) => updateFormField("year", e.target.value)}
              placeholder="e.g., 2025"
              maxLength={4}
            />
          </div>

          <div>
            <Label htmlFor="condition">Condition</Label>
            <Select value={formData.condition} onValueChange={(value) => updateFormField("condition", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Near Mint">Near Mint</SelectItem>
                <SelectItem value="Very Fine">Very Fine</SelectItem>
                <SelectItem value="Fine">Fine</SelectItem>
                <SelectItem value="Very Good">Very Good</SelectItem>
                <SelectItem value="Good">Good</SelectItem>
                <SelectItem value="Fair">Fair</SelectItem>
                <SelectItem value="Poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="price">Price <span className="text-destructive">*</span></Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => updateFormField("price", e.target.value)}
              placeholder="Selling price"
              required
            />
          </div>

          <div>
            <Label htmlFor="cost">Cost (auto-calculated) <span className="text-destructive">*</span></Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => updateFormField("cost", e.target.value)}
              placeholder="Cost"
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={formData.quantity}
              onChange={(e) => updateFormField("quantity", parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="processingNotes">Processing Notes</Label>
          <Textarea
            id="processingNotes"
            value={formData.processingNotes}
            onChange={(e) => updateFormField("processingNotes", e.target.value)}
            placeholder="Additional notes"
            rows={3}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting || !formData.title || !formData.price || !formData.subCategory}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Adding to Batch...
            </>
          ) : (
            "Add to Batch"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
