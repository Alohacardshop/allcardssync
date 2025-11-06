import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
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
import { CardShowCreateLocationDialog } from "./CardShowCreateLocationDialog";
import { CardShowEditLocationDialog } from "./CardShowEditLocationDialog";
import { toast } from "sonner";

export function CardShowLocations() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: locations, isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Filter and search locations
  const filteredLocations = useMemo(() => {
    if (!locations) return [];

    return locations.filter((location) => {
      const matchesSearch = searchTerm === "" || 
        location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (location.code && location.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (location.notes && location.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchesSearch;
    });
  }, [locations, searchTerm]);

  const clearFilters = () => {
    setSearchTerm("");
  };

  const deleteMutation = useMutation({
    mutationFn: async (locationId: string) => {
      const { error } = await supabase
        .from("locations")
        .delete()
        .eq("id", locationId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Location deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      setDeleteDialogOpen(false);
      setSelectedLocation(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete location");
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading locations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Locations</h2>
        {isAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Location
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search locations by name, code, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {searchTerm && (
          <Button variant="outline" size="icon" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Results count */}
      {locations && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredLocations.length} of {locations.length} locations
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Code</th>
              <th className="p-3 text-left">Notes</th>
              {isAdmin && <th className="p-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredLocations?.map((location: any) => (
              <tr key={location.id} className="border-t hover:bg-muted/50">
                <td className="p-3 font-medium">{location.name}</td>
                <td className="p-3">
                  <code className="text-sm bg-muted px-2 py-1 rounded">{location.code || "-"}</code>
                </td>
                <td className="p-3 text-sm text-muted-foreground">{location.notes || "-"}</td>
                {isAdmin && (
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedLocation(location);
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
                          setSelectedLocation(location);
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

      {filteredLocations?.length === 0 && locations && locations.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No locations match your search. <Button variant="link" onClick={clearFilters}>Clear search</Button>
        </div>
      )}

      {locations?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No locations yet. {isAdmin && "Create your first location to get started."}
        </div>
      )}

      {isAdmin && (
        <>
          <CardShowCreateLocationDialog 
            open={createDialogOpen} 
            onOpenChange={setCreateDialogOpen} 
          />
          {selectedLocation && (
            <CardShowEditLocationDialog 
              location={selectedLocation}
              open={editDialogOpen} 
              onOpenChange={setEditDialogOpen} 
            />
          )}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Location</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{selectedLocation?.name}"? This action cannot be undone.
                  {selectedLocation?.code && ` (Code: ${selectedLocation.code})`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => selectedLocation && deleteMutation.mutate(selectedLocation.id)}
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
