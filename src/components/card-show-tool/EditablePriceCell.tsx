import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, X, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface EditablePriceCellProps {
  itemId: string;
  currentPrice: number | null;
  transactionType: "BUY" | "SELL";
  transactionId?: string;
  showId?: string;
}

export function EditablePriceCell({
  itemId,
  currentPrice,
  transactionType,
  transactionId,
  showId,
}: EditablePriceCellProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentPrice?.toString() || "");

  const updatePriceMutation = useMutation({
    mutationFn: async (newPrice: number) => {
      if (transactionId) {
        // Update existing transaction
        const { error } = await supabase
          .from("card_transactions")
          .update({ price: newPrice })
          .eq("id", transactionId);
        if (error) throw error;
      } else {
        // Create new transaction
        const { error } = await supabase
          .from("card_transactions")
          .insert({
            alt_item_id: itemId,
            txn_type: transactionType,
            price: newPrice,
            show_id: showId || null,
            txn_date: new Date().toISOString(),
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${transactionType} price updated`);
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
      queryClient.invalidateQueries({ queryKey: ["alt_items"] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update price");
    },
  });

  const handleSave = () => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      toast.error("Please enter a valid price");
      return;
    }
    updatePriceMutation.mutate(numValue);
  };

  const handleCancel = () => {
    setValue(currentPrice?.toString() || "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="w-24 h-8"
          autoFocus
          disabled={updatePriceMutation.isPending}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            handleSave();
          }}
          disabled={updatePriceMutation.isPending}
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            handleCancel();
          }}
          disabled={updatePriceMutation.isPending}
        >
          <X className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded group"
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
    >
      <span className="font-medium">
        {currentPrice ? `$${currentPrice}` : "-"}
      </span>
      <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
