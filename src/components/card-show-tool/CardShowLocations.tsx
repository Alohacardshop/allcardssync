import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function CardShowLocations() {
  const { isAdmin } = useAuth();

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

  if (isLoading) {
    return <div className="text-center py-8">Loading locations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Locations</h2>
        {isAdmin && (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Location
          </Button>
        )}
      </div>

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
            {locations?.map((location: any) => (
              <tr key={location.id} className="border-t hover:bg-muted/50">
                <td className="p-3 font-medium">{location.name}</td>
                <td className="p-3">
                  <code className="text-sm bg-muted px-2 py-1 rounded">{location.code || "-"}</code>
                </td>
                <td className="p-3 text-sm text-muted-foreground">{location.notes || "-"}</td>
                {isAdmin && (
                  <td className="p-3 text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {locations?.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No locations yet. {isAdmin && "Create your first location to get started."}
        </div>
      )}
    </div>
  );
}
