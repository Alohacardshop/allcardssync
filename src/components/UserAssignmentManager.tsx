
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UserAssignment {
  id: string;
  user_id: string;
  store_key: string;
  location_gid: string;
  location_name: string | null;
  is_default: boolean;
  shopify_stores: {
    name: string;
  };
}

interface Store {
  key: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
  gid: string;
}

interface UserAssignmentManagerProps {
  selectedStore: string | null;
}

export function UserAssignmentManager({ selectedStore }: UserAssignmentManagerProps) {
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(false);
  
  // Form state
  const [email, setEmail] = useState("");
  const [selectedAssignStore, setSelectedAssignStore] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const loadAssignments = async () => {
    try {
      const { data, error } = await supabase
        .from("user_shopify_assignments")
        .select(`
          id,
          user_id,
          store_key,
          location_gid,
          location_name,
          is_default,
          shopify_stores (name)
        `)
        .order("store_key");
      
      if (error) throw error;
      setAssignments(data || []);
    } catch (e) {
      console.error("Failed to load assignments:", e);
      toast.error("Failed to load assignments");
    }
  };

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from("shopify_stores")
        .select("key, name")
        .order("name");
      
      if (error) throw error;
      setStores(data || []);
    } catch (e) {
      console.error("Failed to load stores:", e);
    }
  };

  const loadLocations = async (storeKey: string) => {
    if (!storeKey) {
      setLocations([]);
      return;
    }

    setLoadingLocations(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey }
      });
      
      if (error) throw error;
      
      if (data?.ok && data?.locations) {
        setLocations(data.locations.map((loc: any) => ({
          id: String(loc.id),
          name: loc.name,
          gid: `gid://shopify/Location/${loc.id}`
        })));
      }
    } catch (e) {
      console.error("Failed to load locations:", e);
      toast.error("Failed to load locations");
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAssignments(), loadStores()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedAssignStore) {
      loadLocations(selectedAssignStore);
    }
  }, [selectedAssignStore]);

  const handleAssign = async () => {
    if (!email || !selectedAssignStore || !selectedLocation) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      // First get user by email
      const { data: userData, error: userError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("user_id", "auth.uid()") // This needs to be handled differently
        .limit(1);

      // For now, we'll use the roles-admin function to handle user lookup
      const { data, error } = await supabase.functions.invoke("user-assignment-admin", {
        body: {
          action: "assign",
          email,
          storeKey: selectedAssignStore,
          locationGid: selectedLocation,
          locationName: locations.find(l => l.gid === selectedLocation)?.name,
          isDefault
        }
      });

      if (error) throw error;
      
      const result: any = data;
      if (!result?.ok) throw new Error(result?.error || "Assignment failed");

      toast.success("User assigned successfully");
      loadAssignments();
      setEmail("");
      setSelectedLocation("");
      setIsDefault(false);
    } catch (e) {
      console.error("Assignment failed:", e);
      toast.error("Assignment failed");
    }
  };

  const handleRemove = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("user_shopify_assignments")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;

      toast.success("Assignment removed");
      loadAssignments();
    } catch (e) {
      console.error("Remove failed:", e);
      toast.error("Remove failed");
    }
  };

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading assignments...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-aloha">
        <CardHeader>
          <CardTitle>Assign User to Store & Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="user-email">User Email</Label>
              <Input 
                id="user-email"
                placeholder="user@example.com" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
              />
            </div>
            <div>
              <Label htmlFor="assign-store">Store</Label>
              <Select value={selectedAssignStore} onValueChange={setSelectedAssignStore}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.key} value={store.key}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="location">Location</Label>
            <Select 
              value={selectedLocation} 
              onValueChange={setSelectedLocation}
              disabled={!selectedAssignStore || loadingLocations}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingLocations ? "Loading..." : "Select location"} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.gid} value={location.gid}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is-default"
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked === true)}
            />
            <Label htmlFor="is-default">Set as default location for this user</Label>
          </div>

          <Button onClick={handleAssign} disabled={!email || !selectedAssignStore || !selectedLocation}>
            Assign User
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-aloha">
        <CardHeader>
          <CardTitle>Current Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-mono text-xs">{assignment.user_id.slice(0, 8)}...</TableCell>
                  <TableCell>{assignment.shopify_stores.name}</TableCell>
                  <TableCell>{assignment.location_name || assignment.location_gid}</TableCell>
                  <TableCell>
                    {assignment.is_default && <Badge variant="secondary">Default</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => handleRemove(assignment.id)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No assignments found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
