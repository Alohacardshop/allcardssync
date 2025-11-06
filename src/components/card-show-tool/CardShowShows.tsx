import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { CardShowCreateShowDialog } from "./CardShowCreateShowDialog";
import { CardShowEditShowDialog } from "./CardShowEditShowDialog";
import { toast } from "sonner";

export function CardShowShows() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedShow, setSelectedShow] = useState<any>(null);

  const { data: shows, isLoading } = useQuery({
    queryKey: ["shows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shows")
        .select(`
          *,
          locations(name)
        `)
        .order("start_date", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (showId: string) => {
      const { error } = await supabase
        .from("shows")
        .delete()
        .eq("id", showId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Show deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["shows"] });
      setDeleteDialogOpen(false);
      setSelectedShow(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete show");
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading shows...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Shows</h2>
        {isAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Show
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Location</th>
              <th className="p-3 text-left">Dates</th>
              <th className="p-3 text-left">Notes</th>
              {isAdmin && <th className="p-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {shows?.map((show: any) => (
              <tr key={show.id} className="border-t hover:bg-muted/50">
                <td className="p-3 font-medium">{show.name}</td>
                <td className="p-3">{show.locations?.name || show.location || "-"}</td>
                <td className="p-3">
                  {show.start_date && new Date(show.start_date).toLocaleDateString()}
                  {show.end_date && ` - ${new Date(show.end_date).toLocaleDateString()}`}
                </td>
                <td className="p-3 text-sm text-muted-foreground">{show.notes || "-"}</td>
                {isAdmin && (
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedShow(show);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedShow(show);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shows?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No shows yet. {isAdmin && "Create your first show to get started."}
        </div>
      )}

      {isAdmin && (
        <>
          <CardShowCreateShowDialog 
            open={createDialogOpen} 
            onOpenChange={setCreateDialogOpen} 
          />
          {selectedShow && (
            <CardShowEditShowDialog 
              show={selectedShow}
              open={editDialogOpen} 
              onOpenChange={setEditDialogOpen} 
            />
          )}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Show</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{selectedShow?.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => selectedShow && deleteMutation.mutate(selectedShow.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
