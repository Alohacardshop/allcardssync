import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CloudUpload, ImageIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export type IntakeItemDetails = {
  id: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
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
  imageUrls?: string[];
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

// Clean grade: strip trailing .0
function cleanGrade(grade?: string): string {
  if (!grade) return '';
  return grade.replace(/\.0$/, '');
}

// Clean subject: strip trailing grade info
function cleanSubject(subject?: string): string {
  if (!subject) return '';
  return subject
    .replace(/\s+\d*\s*PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s+PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s+CGC\s+\d+\.?\d*$/i, '')
    .replace(/\s+BGS\s+\d+\.?\d*$/i, '')
    .trim();
}

// Clean variant: strip grade info
function cleanVariant(variant?: string): string {
  if (!variant) return '';
  return variant
    .replace(/\s*PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s*CGC\s+\d+\.?\d*$/i, '')
    .replace(/\s*BGS\s+\d+\.?\d*$/i, '')
    .trim();
}

// Generate title from item fields
function generateTitle(item: IntakeItemDetails): string {
  const parts: string[] = [];
  if (item.year) parts.push(item.year);
  if (item.brandTitle) parts.push(item.brandTitle);
  if (item.subject) parts.push(item.subject);
  if (item.cardNumber) parts.push(`#${item.cardNumber}`);
  if (item.variant && item.variant.toLowerCase() !== 'normal') {
    parts.push(item.variant.toLowerCase());
  }
  if (item.grade && (item.psaCert || item.gradingCompany)) {
    const company = item.gradingCompany || 'PSA';
    parts.push(`${company} ${item.grade}`);
  } else if (item.grade) {
    parts.push(`Grade ${item.grade}`);
  }
  return parts.length > 0 ? parts.join(' ') : 'Unknown Item';
}

function EditIntakeItemDialog({ open, item, onOpenChange, onSave, isAdmin = false }: Props) {
  const [form, setForm] = useState<IntakeItemDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToShopify, setIsSyncingToShopify] = useState(false);

  // Clean and normalize data when dialog opens
  useEffect(() => {
    if (!item) { setForm(null); return; }

    // Extract front/back from imageUrls array or fall back to imageUrl
    const urls = item.imageUrls || (item.imageUrl ? [item.imageUrl] : []);

    setForm({
      ...item,
      grade: cleanGrade(item.grade),
      subject: cleanSubject(item.subject),
      variant: cleanVariant(item.variant),
      sku: item.sku || item.psaCert || '',
      imageUrls: urls,
    });
  }, [item]);

  if (!form) return null;

  const isGradedCard = Boolean(form.grade && form.grade !== 'Raw' && form.grade !== 'Ungraded') || Boolean(form.psaCert);
  const isSyncedToShopify = Boolean(form.shopifyProductId);

  const frontImage = form.imageUrls?.[0] || '';
  const backImage = form.imageUrls?.[1] || '';

  const conditionOptions = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];

  const handleChange = (key: keyof IntakeItemDetails, value: any) => {
    setForm((f) => {
      const updated = { ...(f as IntakeItemDetails), [key]: value };
      if (key === 'price' && value && typeof value === 'string' && value.trim() !== '') {
        const priceValue = parseFloat(value);
        if (!isNaN(priceValue) && priceValue > 0) {
          updated.cost = (Math.round(priceValue * 0.7 * 100) / 100).toString();
        }
      }
      if (key === 'brandTitle' && value) {
        updated.mainCategory = detectMainCategory(value);
      }
      return updated;
    });
  };

  const handleImageChange = (index: number, value: string) => {
    setForm((f) => {
      if (!f) return f;
      const urls = [...(f.imageUrls || ['', ''])];
      while (urls.length < 2) urls.push('');
      urls[index] = value;
      return { ...f, imageUrls: urls, imageUrl: urls[0] || '' };
    });
  };

  const handleSubmit = async () => {
    if (!form || !item) return;
    setIsSaving(true);
    try {
      // Set SKU to PSA cert for graded items
      const finalForm = {
        ...form,
        sku: isGradedCard ? (form.psaCert || form.sku) : form.sku,
        imageUrl: form.imageUrls?.[0] || form.imageUrl || '',
      };

      await onSave(finalForm);

      if (isSyncedToShopify && form.storeKey) {
        const updates: { title?: string; price?: number } = {};
        const oldTitle = generateTitle(item);
        const newTitle = generateTitle(form);
        if (oldTitle !== newTitle) updates.title = newTitle;
        const oldPrice = parseFloat(item.price || '0');
        const newPrice = parseFloat(form.price || '0');
        if (oldPrice !== newPrice) updates.price = newPrice;

        if (Object.keys(updates).length > 0) {
          setIsSyncingToShopify(true);
          try {
            const { data, error } = await supabase.functions.invoke('shopify-update-product', {
              body: { itemId: form.id, storeKey: form.storeKey, updates }
            });
            if (error) {
              toast.warning(`Saved locally, but Shopify sync failed: ${error.message}`);
            } else if (data?.success) {
              toast.success(`Changes saved & synced to Shopify (${data.updatedFields?.join(', ') || 'fields'})`);
            } else {
              toast.warning('Saved locally, but Shopify sync failed');
            }
          } catch {
            toast.warning('Saved locally, but Shopify sync failed');
          } finally {
            setIsSyncingToShopify(false);
          }
        } else {
          toast.success('Changes saved');
        }
      } else {
        toast.success('Changes saved');
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Item Details
            {isSyncedToShopify && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                <CloudUpload className="h-3 w-3" />
                Auto-syncs to Shopify
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Front & Back Image Preview */}
        <div className="grid grid-cols-2 gap-3">
          {[frontImage, backImage].map((url, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {idx === 0 ? 'Front' : 'Back'}
              </span>
              <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-muted border-2 border-dashed border-muted-foreground/20">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                    <img
                      src={url}
                      alt={idx === 0 ? 'Front' : 'Back'}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground/50 mt-1">No image</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* PSA-Style Item Information */}
        <div className="space-y-3 py-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Item Information</h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Cert Number */}
            <div>
              <Label htmlFor="psaCert" className="text-xs">Cert Number</Label>
              <Input id="psaCert" value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} placeholder="Certificate number" />
            </div>
            {/* Grading Company */}
            <div>
              <Label htmlFor="gradingCompany" className="text-xs">Grading Company</Label>
              <Select value={form.gradingCompany || "PSA"} onValueChange={(value) => handleChange("gradingCompany", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="PSA">PSA</SelectItem>
                  <SelectItem value="CGC">CGC</SelectItem>
                  <SelectItem value="BGS">BGS</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Item Grade */}
            <div>
              <Label htmlFor="grade" className="text-xs">Item Grade</Label>
              <Input id="grade" value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
            </div>
            {/* Name (Subject) */}
            <div className="sm:col-span-2">
              <Label htmlFor="subject" className="text-xs">Name / Subject</Label>
              <Input id="subject" value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
            </div>
            {/* Card Number */}
            <div>
              <Label htmlFor="cardNumber" className="text-xs">Card / Issue Number</Label>
              <Input id="cardNumber" value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
            </div>
            {/* Year */}
            <div>
              <Label htmlFor="year" className="text-xs">Year</Label>
              <Input id="year" value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
            </div>
            {/* Brand / Publisher */}
            <div>
              <Label htmlFor="brandTitle" className="text-xs">Publisher / Brand</Label>
              <Input id="brandTitle" value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
            </div>
            {/* Variant */}
            <div>
              <Label htmlFor="variant" className="text-xs">Variety / Pedigree</Label>
              <Input id="variant" value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., Foil, Reverse Holo" />
            </div>
            {/* Condition (raw cards only) */}
            {!isGradedCard && (
              <div>
                <Label htmlFor="condition" className="text-xs">Condition</Label>
                <Select value={form.condition || ""} onValueChange={(value) => handleChange("condition", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border shadow-md z-50">
                    {conditionOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mainCategory" className="text-xs">Main Category</Label>
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
              <Label htmlFor="subCategory" className="text-xs">Sub-Category</Label>
              <SubCategoryCombobox
                mainCategory={form.mainCategory || "tcg"}
                value={form.subCategory || ""}
                onChange={(value, mainCategoryId) => {
                  handleChange("subCategory", value);
                  if (mainCategoryId) handleChange("mainCategory", mainCategoryId);
                }}
              />
            </div>
          </div>

          <Separator />

          {/* Pricing & Inventory */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pricing & Inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="price" className="text-xs">Price</Label>
              <Input id="price" value={form.price || ""} onChange={(e) => handleChange("price", e.target.value)} placeholder="$" />
            </div>
            <div>
              <Label htmlFor="cost" className="text-xs">Cost</Label>
              <Input id="cost" value={form.cost || ""} onChange={(e) => handleChange("cost", e.target.value)} placeholder="$" />
            </div>
            <div>
              <Label htmlFor="quantity" className="text-xs">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={String(form.quantity ?? 1)}
                onChange={(e) => handleChange("quantity", Number(e.target.value) || 0)}
                disabled={Boolean(form.shopifyProductId)}
                className={form.shopifyProductId ? "bg-muted cursor-not-allowed" : ""}
              />
            </div>
            <div>
              <Label htmlFor="sku" className="text-xs">SKU</Label>
              <Input id="sku" value={form.sku || ""} onChange={(e) => handleChange("sku", e.target.value)} />
              {isGradedCard && form.psaCert && (
                <p className="text-xs text-muted-foreground mt-0.5">Auto-set from cert #</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Image URLs */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Image URLs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="frontImageUrl" className="text-xs">Front Image URL</Label>
              <Input
                id="frontImageUrl"
                value={frontImage}
                onChange={(e) => handleImageChange(0, e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="backImageUrl" className="text-xs">Back Image URL</Label>
              <Input
                id="backImageUrl"
                value={backImage}
                onChange={(e) => handleImageChange(1, e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          {/* Admin fields */}
          {isAdmin && (
            <>
              <Separator />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Admin</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sourceProvider" className="text-xs">Source Provider</Label>
                  <Input id="sourceProvider" value={form.sourceProvider || ""} onChange={(e) => handleChange("sourceProvider", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="shopifyProductId" className="text-xs">Shopify Product ID</Label>
                  <Input id="shopifyProductId" value={form.shopifyProductId || ""} onChange={(e) => handleChange("shopifyProductId", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="shopifyVariantId" className="text-xs">Shopify Variant ID</Label>
                  <Input id="shopifyVariantId" value={form.shopifyVariantId || ""} onChange={(e) => handleChange("shopifyVariantId", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="shopifyInventoryItemId" className="text-xs">Shopify Inventory Item ID</Label>
                  <Input id="shopifyInventoryItemId" value={form.shopifyInventoryItemId || ""} onChange={(e) => handleChange("shopifyInventoryItemId", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="shopifyLocationGid" className="text-xs">Shopify Location GID</Label>
                  <Input id="shopifyLocationGid" value={form.shopifyLocationGid || ""} onChange={(e) => handleChange("shopifyLocationGid", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="storeKey" className="text-xs">Store Key</Label>
                  <Input id="storeKey" value={form.storeKey || ""} onChange={(e) => handleChange("storeKey", e.target.value)} />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving || isSyncingToShopify ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isSyncingToShopify ? 'Syncing to Shopify...' : 'Saving...'}
              </>
            ) : isSyncedToShopify ? (
              <>
                <CloudUpload className="h-4 w-4 mr-2" />
                Save & Sync
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditIntakeItemDialog;
export { EditIntakeItemDialog };
