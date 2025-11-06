import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CardShowEditLocationDialogProps {
  location: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CardShowEditLocationDialog({ location, open, onOpenChange }: CardShowEditLocationDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (location) {
      setName(location.name || "");
      setCode(location.code || "");
      setNotes(location.notes || "");
    }
  }, [location]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .update({
          name,
          code: code || null,
          notes: notes || null,
        })
        .eq("id", location.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Location updated successfully");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update location");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Location name is required");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Location</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Location Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Las Vegas Convention Center"
              required
            />
          </div>

          <div>
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LV-CC"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information about the location"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Location
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
