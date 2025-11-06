import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CardShowCreateShowDialog } from "./CardShowCreateShowDialog";
import { CardShowEditShowDialog } from "./CardShowEditShowDialog";

export function CardShowShows() {
  const { isAdmin } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
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
        </>
      )}
    </div>
  );
}
