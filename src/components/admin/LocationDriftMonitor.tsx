import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface LocationDriftFlag {
  id: string;
  sku: string;
  card_id: string | null;
  drift_type: 'multi_location' | 'no_location' | 'location_mismatch';
  expected_location_id: string | null;
  actual_locations: Array<{ location_id: string; location_gid: string; quantity: number; store_key?: string }> | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  store_key?: string | null;
}

const driftTypeLabels: Record<string, { label: string; variant: "destructive" | "outline" | "secondary" }> = {
  multi_location: { label: "Multiple Locations", variant: "destructive" },
  no_location: { label: "No Stock", variant: "outline" },
  location_mismatch: { label: "Location Mismatch", variant: "secondary" },
};

export function LocationDriftMonitor() {
  const queryClient = useQueryClient();
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const { data: flags, isLoading, refetch } = useQuery({
    queryKey: ["location-drift-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("location_drift_flags")
        .select("*")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as LocationDriftFlag[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ flagId, notes }: { flagId: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.rpc("resolve_location_drift", {
        p_flag_id: flagId,
        p_resolved_by: user?.id || null,
        p_notes: notes || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-drift-flags"] });
      setSelectedFlag(null);
      setResolutionNotes("");
      toast.success("Drift flag resolved");
    },
    onError: (error) => {
      toast.error(`Failed to resolve: ${error.message}`);
    },
  });

  const enforceLocationMutation = useMutation({
    mutationFn: async ({ sku, locationId, storeKey }: { sku: string; locationId: string; storeKey: string }) => {
      const { data, error } = await supabase.functions.invoke("enforce-single-location-stock", {
        body: { sku, desired_location_id: locationId, store_key: storeKey },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["location-drift-flags"] });
      toast.success("Location enforcement completed");
    },
    onError: (error) => {
      toast.error(`Enforcement failed: ${error.message}`);
    },
  });

  const unresolvedCount = flags?.length || 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location Drift Monitor
          </CardTitle>
          <CardDescription>
            Track and resolve inventory location discrepancies
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {unresolvedCount > 0 && (
            <Badge variant="destructive" className="text-lg px-3 py-1">
              {unresolvedCount} Unresolved
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !flags || flags.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">No location drifts detected</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Drift Type</TableHead>
                <TableHead>Expected Location</TableHead>
                <TableHead>Actual Locations</TableHead>
                <TableHead>Detected</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flags.map((flag) => {
                const driftInfo = driftTypeLabels[flag.drift_type] || {
                  label: flag.drift_type,
                  variant: "secondary" as const,
                };

                return (
                  <TableRow key={flag.id}>
                    <TableCell className="font-mono font-medium">{flag.sku}</TableCell>
                    <TableCell>
                      <Badge variant={driftInfo.variant}>
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {driftInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {flag.expected_location_id ? (
                        <span className="font-mono">{flag.expected_location_id.split("/").pop()}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {flag.actual_locations && flag.actual_locations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {flag.actual_locations.map((loc, idx) => (
                            <Badge key={idx} variant="outline" className="font-mono text-xs">
                              {loc.location_id}: qty={loc.quantity}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(flag.detected_at), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {flag.drift_type === "multi_location" &&
                          flag.actual_locations &&
                          flag.actual_locations.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                            onClick={() => {
                                // Use the first location with stock
                                const loc = flag.actual_locations![0];
                                enforceLocationMutation.mutate({
                                  sku: flag.sku,
                                  locationId: loc.location_gid,
                                  storeKey: flag.store_key || loc.store_key || "hawaii",
                                });
                              }}
                              disabled={enforceLocationMutation.isPending}
                            >
                              Fix to First
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (selectedFlag === flag.id) {
                              resolveMutation.mutate({
                                flagId: flag.id,
                                notes: resolutionNotes,
                              });
                            } else {
                              setSelectedFlag(flag.id);
                            }
                          }}
                          disabled={resolveMutation.isPending}
                        >
                          {selectedFlag === flag.id ? "Confirm" : "Resolve"}
                        </Button>
                      </div>
                      {selectedFlag === flag.id && (
                        <div className="mt-2">
                          <Textarea
                            placeholder="Resolution notes..."
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            className="text-sm h-16"
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
