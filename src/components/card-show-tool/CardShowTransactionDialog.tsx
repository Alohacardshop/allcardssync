import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CardShowTransactionDialogProps {
  item: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardShowTransactionDialog({ item, open, onOpenChange }: CardShowTransactionDialogProps) {
  const queryClient = useQueryClient();
  const [txnType, setTxnType] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [showId, setShowId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: shows } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select("id, name")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const recordTransactionMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("card_transactions").insert({
        alt_item_id: item.id,
        txn_type: txnType,
        price: parseFloat(price),
        show_id: showId || null,
        notes: notes || null,
        txn_date: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${txnType} transaction recorded`);
      queryClient.invalidateQueries({ queryKey: ["alt-items"] });
      onOpenChange(false);
      setPrice("");
      setShowId("");
      setNotes("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to record transaction");
    },
  });

  const handleSubmit = () => {
    if (!price || parseFloat(price) <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    recordTransactionMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Transaction</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <p className="font-medium">{item?.title}</p>
            <p className="text-sm text-muted-foreground">
              {item?.grading_service} {item?.grade}
            </p>
          </div>

          <div>
            <Label>Transaction Type</Label>
            <Select value={txnType} onValueChange={(value) => setTxnType(value as "BUY" | "SELL")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUY">Buy</SelectItem>
                <SelectItem value="SELL">Sell</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="price">Price ($)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="show">Show (optional)</Label>
            <Select value={showId} onValueChange={setShowId}>
              <SelectTrigger id="show">
                <SelectValue placeholder="Select a show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {shows?.map((show) => (
                  <SelectItem key={show.id} value={show.id}>
                    {show.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={recordTransactionMutation.isPending}>
            {recordTransactionMutation.isPending ? "Recording..." : "Record Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
