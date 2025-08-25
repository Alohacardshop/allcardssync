import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type IntakeItemDetails = {
  id: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  category?: string;
  variant?: string;
  cardNumber?: string;
  grade?: string;
  psaCert?: string;
  price?: string;
  cost?: string;
  sku?: string;
  quantity?: number;
};

interface Props {
  open: boolean;
  item: IntakeItemDetails | null;
  onOpenChange: (open: boolean) => void;
  onSave: (values: IntakeItemDetails) => Promise<void> | void;
}

export default function EditIntakeItemDialog({ open, item, onOpenChange, onSave }: Props) {
  const [form, setForm] = useState<IntakeItemDetails | null>(item);

  useEffect(() => {
    setForm(item);
  }, [item]);

  if (!form) return null;

  const handleChange = (key: keyof IntakeItemDetails, value: any) => {
    setForm((f) => ({ ...(f as IntakeItemDetails), [key]: value }));
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
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="variant">Variant</Label>
            <Input id="variant" value={form.variant || ""} onChange={(e) => handleChange("variant", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input id="cardNumber" value={form.cardNumber || ""} onChange={(e) => handleChange("cardNumber", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="grade">Grade</Label>
            <Input id="grade" value={form.grade || ""} onChange={(e) => handleChange("grade", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="psaCert">PSA Cert</Label>
            <Input id="psaCert" value={form.psaCert || ""} onChange={(e) => handleChange("psaCert", e.target.value)} />
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
            <Input id="quantity" type="number" value={String(form.quantity ?? 1)} onChange={(e) => handleChange("quantity", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={form.sku || ""} onChange={(e) => handleChange("sku", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
