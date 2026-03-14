import { useEffect, useState, useMemo } from "react";
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
import { generateTitle } from '@/utils/generateTitle';

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

// --- Helpers ---

type ItemType = 'psa-comic' | 'cgc-comic' | 'psa-card' | 'raw-card';

function detectItemType(mainCategory?: string, gradingCompany?: string, grade?: string, psaCert?: string): ItemType {
  const isComic = mainCategory === 'comics';
  const company = (gradingCompany || '').toUpperCase();
  const isGraded = Boolean(grade && grade !== 'Raw' && grade !== 'Ungraded') || Boolean(psaCert);

  if (isComic && company === 'CGC') return 'cgc-comic';
  if (isComic) return 'psa-comic'; // default comics to PSA layout
  if (isGraded) return 'psa-card';
  return 'raw-card';
}

function cleanGrade(grade?: string): string {
  if (!grade) return '';
  return grade.replace(/\.0$/, '');
}

function cleanSubject(subject?: string): string {
  if (!subject) return '';
  return subject
    .replace(/\s+\d*\s*PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s+PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s+CGC\s+\d+\.?\d*$/i, '')
    .replace(/\s+BGS\s+\d+\.?\d*$/i, '')
    .trim();
}

function cleanVariant(variant?: string): string {
  if (!variant) return '';
  return variant
    .replace(/\s*PSA\s+\d+\.?\d*$/i, '')
    .replace(/\s*CGC\s+\d+\.?\d*$/i, '')
    .replace(/\s*BGS\s+\d+\.?\d*$/i, '')
    .trim();
}


// --- Layout-specific field sections ---

interface FieldProps {
  form: IntakeItemDetails;
  handleChange: (key: keyof IntakeItemDetails, value: any) => void;
}

function PSAComicFields({ form, handleChange }: FieldProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">Cert Number</Label>
        <Input value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} placeholder="PSA certificate #" />
      </div>
      <div>
        <Label className="text-xs">Grading Company</Label>
        <GradingCompanySelect value={form.gradingCompany} onChange={(v) => handleChange("gradingCompany", v)} />
      </div>
      <div>
        <Label className="text-xs">Item Grade</Label>
        <Input value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Name / Subject</Label>
        <Input value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Volume / Issue Number</Label>
        <Input value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Publication Year</Label>
        <Input value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Publisher</Label>
        <Input value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Variety / Pedigree</Label>
        <Input value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., Newsstand, Direct" />
      </div>
    </div>
  );
}

function CGCComicFields({ form, handleChange }: FieldProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">CGC Cert Number</Label>
        <Input value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} placeholder="CGC certificate #" />
      </div>
      <div>
        <Label className="text-xs">Grading Company</Label>
        <GradingCompanySelect value={form.gradingCompany} onChange={(v) => handleChange("gradingCompany", v)} />
      </div>
      <div>
        <Label className="text-xs">CGC Grade</Label>
        <Input value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Label Type</Label>
        <Select value={form.condition || "universal"} onValueChange={(v) => handleChange("condition", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="bg-background border shadow-md z-50">
            <SelectItem value="universal">Universal (Blue)</SelectItem>
            <SelectItem value="signature">Signature Series (Yellow)</SelectItem>
            <SelectItem value="restored">Restored (Purple)</SelectItem>
            <SelectItem value="qualified">Qualified (Green)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Title</Label>
        <Input value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Issue Number</Label>
        <Input value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Year</Label>
        <Input value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Publisher</Label>
        <Input value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Variant / Cover</Label>
        <Input value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., 1:25 Variant Cover" />
      </div>
    </div>
  );
}

function PSACardFields({ form, handleChange }: FieldProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">Cert Number</Label>
        <Input value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} placeholder="PSA certificate #" />
      </div>
      <div>
        <Label className="text-xs">Grading Company</Label>
        <GradingCompanySelect value={form.gradingCompany} onChange={(v) => handleChange("gradingCompany", v)} />
      </div>
      <div>
        <Label className="text-xs">Grade</Label>
        <Input value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-xs">Card Name</Label>
        <Input value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Card Number</Label>
        <Input value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Year</Label>
        <Input value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Brand / Set</Label>
        <Input value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Variety / Parallel</Label>
        <Input value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., Foil, Reverse Holo" />
      </div>
    </div>
  );
}

function RawCardFields({ form, handleChange }: FieldProps) {
  const conditionOptions = ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <Label className="text-xs">Card Name</Label>
        <Input value={form.subject || ""} onChange={(e) => handleChange("subject", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Card Number</Label>
        <Input value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Year</Label>
        <Input value={form.year || ""} onChange={(e) => handleChange("year", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Brand / Set</Label>
        <Input value={form.brandTitle || ""} onChange={(e) => handleChange("brandTitle", e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">Variant</Label>
        <Input value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} placeholder="e.g., Foil, Reverse Holo" />
      </div>
      <div>
        <Label className="text-xs">Condition</Label>
        <Select value={form.condition || ""} onValueChange={(v) => handleChange("condition", v)}>
          <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
          <SelectContent className="bg-background border shadow-md z-50">
            {conditionOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function GradingCompanySelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || "PSA"} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent className="bg-background border shadow-md z-50">
        <SelectItem value="PSA">PSA</SelectItem>
        <SelectItem value="CGC">CGC</SelectItem>
        <SelectItem value="BGS">BGS</SelectItem>
        <SelectItem value="Other">Other</SelectItem>
      </SelectContent>
    </Select>
  );
}

// --- Type badge ---

const TYPE_LABELS: Record<ItemType, { label: string; emoji: string }> = {
  'psa-comic': { label: 'PSA Comic', emoji: '📚' },
  'cgc-comic': { label: 'CGC Comic', emoji: '📚' },
  'psa-card':  { label: 'Graded Card', emoji: '🎴' },
  'raw-card':  { label: 'Raw Card', emoji: '🃏' },
};

// --- Main Dialog ---

function EditIntakeItemDialog({ open, item, onOpenChange, onSave, isAdmin = false }: Props) {
  const [form, setForm] = useState<IntakeItemDetails | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingToShopify, setIsSyncingToShopify] = useState(false);

  useEffect(() => {
    if (!item) { setForm(null); return; }
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

  const itemType = useMemo(() => {
    if (!form) return 'raw-card' as ItemType;
    return detectItemType(form.mainCategory, form.gradingCompany, form.grade, form.psaCert);
  }, [form?.mainCategory, form?.gradingCompany, form?.grade, form?.psaCert]);

  if (!form) return null;

  const isGraded = itemType !== 'raw-card';
  const isSyncedToShopify = Boolean(form.shopifyProductId);
  const showDualImages = itemType === 'psa-comic' || itemType === 'cgc-comic';
  const frontImage = form.imageUrls?.[0] || '';
  const backImage = form.imageUrls?.[1] || '';
  const typeInfo = TYPE_LABELS[itemType];

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
      const finalForm = {
        ...form,
        sku: isGraded ? (form.psaCert || form.sku) : form.sku,
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
            if (error) toast.warning(`Saved locally, but Shopify sync failed: ${error.message}`);
            else if (data?.success) toast.success(`Saved & synced to Shopify (${data.updatedFields?.join(', ') || 'fields'})`);
            else toast.warning('Saved locally, but Shopify sync failed');
          } catch { toast.warning('Saved locally, but Shopify sync failed'); }
          finally { setIsSyncingToShopify(false); }
        } else { toast.success('Changes saved'); }
      } else { toast.success('Changes saved'); }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save changes');
    } finally { setIsSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Item Details
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {typeInfo.emoji} {typeInfo.label}
            </span>
            {isSyncedToShopify && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                <CloudUpload className="h-3 w-3" />
                Shopify
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Image Preview — dual for comics, single for cards */}
        <div className={`grid gap-3 ${showDualImages ? 'grid-cols-2' : 'grid-cols-1 max-w-[200px] mx-auto'}`}>
          {(showDualImages ? [frontImage, backImage] : [frontImage]).map((url, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {showDualImages ? (idx === 0 ? 'Front' : 'Back') : 'Image'}
              </span>
              <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-muted border-2 border-dashed border-muted-foreground/20">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                    <img src={url} alt={idx === 0 ? 'Front' : 'Back'} className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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

        <div className="space-y-3 py-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Item Information</h3>

          {/* Type-specific fields */}
          {itemType === 'psa-comic' && <PSAComicFields form={form} handleChange={handleChange} />}
          {itemType === 'cgc-comic' && <CGCComicFields form={form} handleChange={handleChange} />}
          {itemType === 'psa-card' && <PSACardFields form={form} handleChange={handleChange} />}
          {itemType === 'raw-card' && <RawCardFields form={form} handleChange={handleChange} />}

          {/* Category (shared) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <Label className="text-xs">Main Category</Label>
              <Select value={form.mainCategory || "tcg"} onValueChange={(v) => handleChange("mainCategory", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-background border shadow-md z-50">
                  <SelectItem value="tcg">🎴 TCG</SelectItem>
                  <SelectItem value="comics">📚 Comics</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sub-Category</Label>
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

          {/* Pricing & Inventory (shared) */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pricing & Inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Price</Label>
              <Input value={form.price || ""} onChange={(e) => handleChange("price", e.target.value)} placeholder="$" />
            </div>
            <div>
              <Label className="text-xs">Cost</Label>
              <Input value={form.cost || ""} onChange={(e) => handleChange("cost", e.target.value)} placeholder="$" />
            </div>
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input type="number" value={String(form.quantity ?? 1)}
                onChange={(e) => handleChange("quantity", Number(e.target.value) || 0)}
                disabled={Boolean(form.shopifyProductId)}
                className={form.shopifyProductId ? "bg-muted cursor-not-allowed" : ""} />
            </div>
            <div>
              <Label className="text-xs">SKU</Label>
              <Input value={form.sku || ""} onChange={(e) => handleChange("sku", e.target.value)} />
              {isGraded && form.psaCert && (
                <p className="text-xs text-muted-foreground mt-0.5">Auto-set from cert #</p>
              )}
            </div>
          </div>

          <Separator />

          {/* Image URLs */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Image URLs</h3>
          <div className={`grid gap-3 ${showDualImages ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <Label className="text-xs">{showDualImages ? 'Front Image URL' : 'Image URL'}</Label>
              <Input value={frontImage} onChange={(e) => handleImageChange(0, e.target.value)} placeholder="https://..." />
            </div>
            {showDualImages && (
              <div>
                <Label className="text-xs">Back Image URL</Label>
                <Input value={backImage} onChange={(e) => handleImageChange(1, e.target.value)} placeholder="https://..." />
              </div>
            )}
          </div>

          {/* Admin fields */}
          {isAdmin && (
            <>
              <Separator />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Admin</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label className="text-xs">Source Provider</Label><Input value={form.sourceProvider || ""} onChange={(e) => handleChange("sourceProvider", e.target.value)} /></div>
                <div><Label className="text-xs">Shopify Product ID</Label><Input value={form.shopifyProductId || ""} onChange={(e) => handleChange("shopifyProductId", e.target.value)} /></div>
                <div><Label className="text-xs">Shopify Variant ID</Label><Input value={form.shopifyVariantId || ""} onChange={(e) => handleChange("shopifyVariantId", e.target.value)} /></div>
                <div><Label className="text-xs">Shopify Inventory Item ID</Label><Input value={form.shopifyInventoryItemId || ""} onChange={(e) => handleChange("shopifyInventoryItemId", e.target.value)} /></div>
                <div><Label className="text-xs">Shopify Location GID</Label><Input value={form.shopifyLocationGid || ""} onChange={(e) => handleChange("shopifyLocationGid", e.target.value)} /></div>
                <div><Label className="text-xs">Store Key</Label><Input value={form.storeKey || ""} onChange={(e) => handleChange("storeKey", e.target.value)} /></div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving || isSyncingToShopify ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isSyncingToShopify ? 'Syncing...' : 'Saving...'}</>
            ) : isSyncedToShopify ? (
              <><CloudUpload className="h-4 w-4 mr-2" />Save & Sync</>
            ) : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EditIntakeItemDialog;
export { EditIntakeItemDialog };
