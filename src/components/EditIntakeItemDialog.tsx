import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";

export type IntakeItemDetails = {
  id: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  category?: string;
  variant?: string;
  condition?: string;
  cardNumber?: string;
  grade?: string;
  psaCert?: string;
  gradingCompany?: string;
  price?: string;
  cost?: string;
  sku?: string;
  quantity?: number;
  imageUrl?: string;
  sourceProvider?: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  shopifyInventoryItemId?: string;
  shopifyLocationGid?: string;
  storeKey?: string;
  mainCategory?: string;
  subCategory?: string;
};

interface Props {
  open: boolean;
  item: IntakeItemDetails | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: IntakeItemDetails) => Promise<void> | void;
  isAdmin?: boolean;
}

function EditIntakeItemDialog({ open, item, onOpenChange, onSave, isAdmin = false }: Props) {
  const [form, setForm] = useState<IntakeItemDetails | null>(item);

  useEffect(() => {
    setForm(item);
  }, [item]);

  if (!form) return null;

  // Check if this is a graded card
  const isGradedCard = Boolean(form.grade && form.grade !== 'Raw' && form.grade !== 'Ungraded') || Boolean(form.psaCert);

  const conditionOptions = [
    "Near Mint",
    "Lightly Played", 
    "Moderately Played",
    "Heavily Played",
    "Damaged"
  ];

  const handleChange = (key: keyof IntakeItemDetails, value: any) => {
    setForm((f) => {
      const updated = { ...(f as IntakeItemDetails), [key]: value };
      
      // Auto-calculate cost when price changes (70% of price)
      if (key === 'price' && value && typeof value === 'string' && value.trim() !== '') {
        const priceValue = parseFloat(value);
        if (!isNaN(priceValue) && priceValue > 0) {
          updated.cost = (Math.round(priceValue * 0.7 * 100) / 100).toString();
        }
      }
      
      // Auto-detect main category when brand changes
      if (key === 'brandTitle' && value) {
        const detected = detectMainCategory(value);
        updated.mainCategory = detected;
      }
      
      return updated;
    });
  };

  const handleSubmit = async () => {
    await onSave(form as IntakeItemDetails);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Item Details</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div>
            <Label htmlFor="mainCategory">Main Category</Label>
            <Select value={form.mainCategory || "tcg"} onValueChange={(value) => handleChange("mainCategory", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-md z-50">
                <SelectItem value="tcg">🎴 TCG</SelectItem>
                <SelectItem value="comics">📚 Comics</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="subCategory">Sub-Category</Label>
            <SubCategoryCombobox
              mainCategory={form.mainCategory || "tcg"}
              value={form.subCategory || ""}
              onChange={(value, mainCategoryId) => {
                handleChange("subCategory", value);
                if (mainCategoryId) {
                  handleChange("mainCategory", mainCategoryId);
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor="year">Year</Label>
            <Input id="year" value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="brandTitle">Brand / Title / Game</Label>
            <Input id="brandTitle" value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="category">Category (Legacy)</Label>
            <Input id="category" value={form.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="variant">Variant</Label>
            <Input id="variant" value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., Foil, Reverse Holo" />
          </div>
          {!isGradedCard && (
            <div>
              <Label htmlFor="condition">Condition</Label>
              <Select value={form.condition || ""} onValueChange={(value) => handleChange("condition", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  {conditionOptions.map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {condition}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input id="cardNumber" value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="grade">Grade</Label>
            <Input id="grade" value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gradingCompany">Grading Company</Label>
            <Select value={form.gradingCompany || "PSA"} onValueChange={(value) => handleChange("gradingCompany", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select grading company" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-md z-50">
                <SelectItem value="PSA">PSA</SelectItem>
                <SelectItem value="CGC">CGC</SelectItem>
                <SelectItem value="BGS">BGS</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="psaCert">{form.gradingCompany || 'PSA'} Certificate</Label>
            <Input id="psaCert" value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} placeholder="Certificate number" />
            {form.psaCert && form.grade && form.grade !== 'Raw' && form.grade !== 'Ungraded' && (
              <p className="text-xs text-muted-foreground mt-1">
                Shopify SKU & barcode will be the certificate number.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="price">Price</Label>
            <Input id="price" value={form.price || ""} onChange={(e) => handleChange("price", e.target.value)} placeholder="$" />
          </div>
          <div>
            <Label htmlFor="cost">Cost</Label>
            <Input id="cost" value={form.cost || ""} onChange={(e) => handleChange("cost", e.target.value)} placeholder="$" />
          </div>
          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input 
              id="quantity" 
              type="number" 
              value={String(form.quantity ?? 1)} 
              onChange={(e) => handleChange("quantity", Number(e.target.value) || 0)}
              disabled={Boolean(form.shopifyProductId)}
              className={form.shopifyProductId ? "bg-muted cursor-not-allowed" : ""}
            />
            {form.shopifyProductId && (
              <p className="text-xs text-muted-foreground mt-1">
                Quantity managed by Shopify. Use 'Resync from Shopify' to update.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={form.sku || ""} onChange={(e) => handleChange("sku", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input 
              id="imageUrl" 
              value={form.imageUrl || ""} 
              onChange={(e) => handleChange("imageUrl", e.target.value)} 
              placeholder="https://example.com/image.jpg"
            />
            {form.imageUrl && (
              <p className="text-xs text-muted-foreground mt-1">
                This image will be used in Shopify product listing.
              </p>
            )}
          </div>
          {isAdmin && (
            <>
              <div>
                <Label htmlFor="sourceProvider">Source Provider</Label>
                <Input id="sourceProvider" value={form.sourceProvider || ""} onChange={(e) => handleChange("sourceProvider", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="shopifyProductId">Shopify Product ID</Label>
                <Input id="shopifyProductId" value={form.shopifyProductId || ""} onChange={(e) => handleChange("shopifyProductId", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="shopifyVariantId">Shopify Variant ID</Label>
                <Input id="shopifyVariantId" value={form.shopifyVariantId || ""} onChange={(e) => handleChange("shopifyVariantId", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="shopifyInventoryItemId">Shopify Inventory Item ID</Label>
                <Input id="shopifyInventoryItemId" value={form.shopifyInventoryItemId || ""} onChange={(e) => handleChange("shopifyInventoryItemId", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="shopifyLocationGid">Shopify Location GID</Label>
                <Input id="shopifyLocationGid" value={form.shopifyLocationGid || ""} onChange={(e) => handleChange("shopifyLocationGid", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="storeKey">Store Key</Label>
                <Input id="storeKey" value={form.storeKey || ""} onChange={(e) => handleChange("storeKey", e.target.value)} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditIntakeItemDialog;
export { EditIntakeItemDialog };
