import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CardShowEditDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardShowEditDialog({ item, open, onOpenChange }: CardShowEditDialogProps) {
  const queryClient = useQueryClient();
  const [altValue, setAltValue] = useState(item?.alt_value?.toString() || "");
  const [notes, setNotes] = useState(item?.alt_notes || "");

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("alt_items")
        .update({
          alt_value: altValue ? parseFloat(altValue) : null,
          alt_notes: notes || null,
        })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card updated successfully");
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update card");
    },
  });

  const handleSubmit = () => {
    editMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Show Card Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="font-medium">{item?.title}</p>
            <p className="text-sm text-muted-foreground">
              {item?.grading_service} {item?.grade}
            </p>
          </div>

          <div>
            <Label htmlFor="alt-value">ALT Value ($)</Label>
            <Input
              id="alt-value"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={altValue}
              onChange={(e) => setAltValue(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Add notes about this card..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={editMutation.isPending}>
            {editMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
