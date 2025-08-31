
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Users, MapPin, Settings } from "lucide-react";

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

interface UserWithEmail {
  id: string;
  email: string;
}

interface UserLocationPermissions {
  userId: string;
  email: string;
  assignments: UserAssignment[];
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

export function UserAssignmentManager() {
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [userPermissions, setUserPermissions] = useState<UserLocationPermissions[]>([]);
  
  // Form state for quick assign
  const [email, setEmail] = useState("");
  const [selectedAssignStore, setSelectedAssignStore] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  
  // Form state for bulk user management
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedManageStore, setSelectedManageStore] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [defaultLocation, setDefaultLocation] = useState("");

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
      
      // Group assignments by user
      const grouped = (data || []).reduce((acc, assignment) => {
        const existing = acc.find(u => u.userId === assignment.user_id);
        if (existing) {
          existing.assignments.push(assignment);
        } else {
          acc.push({
            userId: assignment.user_id,
            email: '', // Will be populated from users list
            assignments: [assignment]
          });
        }
        return acc;
      }, [] as UserLocationPermissions[]);
      
      setUserPermissions(grouped);
    } catch (e) {
      console.error("Failed to load assignments:", e);
      toast.error("Failed to load assignments");
    }
  };

  const loadUsers = async () => {
    try {
      // Load users from auth system via edge function
      const { data, error } = await supabase.functions.invoke("roles-admin", {
        body: { action: "list" }
      });
      
      if (error) throw error;
      
      if (data?.users) {
        const userList = data.users.map((user: any) => ({
          id: user.id,
          email: user.email || 'No email'
        }));
        setUsers(userList);
        
        // Update user permissions with email addresses
        setUserPermissions(prev => prev.map(up => ({
          ...up,
          email: userList.find(u => u.id === up.userId)?.email || 'Unknown'
        })));
      }
    } catch (e) {
      console.error("Failed to load users:", e);
      // Don't show error toast as this might not be implemented
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
    Promise.all([loadAssignments(), loadStores(), loadUsers()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedAssignStore) {
      loadLocations(selectedAssignStore);
    }
  }, [selectedAssignStore]);

  useEffect(() => {
    if (selectedManageStore) {
      loadLocations(selectedManageStore);
    }
  }, [selectedManageStore]);

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

  const handleBulkAssign = async () => {
    if (!selectedUser || !selectedManageStore || selectedLocations.length === 0) {
      toast.error("Please select user, store, and at least one location");
      return;
    }

    const userEmail = users.find(u => u.id === selectedUser)?.email;
    if (!userEmail) {
      toast.error("User email not found");
      return;
    }

    try {
      // Remove existing assignments for this user/store combination
      const { error: deleteError } = await supabase
        .from("user_shopify_assignments")
        .delete()
        .eq("user_id", selectedUser)
        .eq("store_key", selectedManageStore);

      if (deleteError) throw deleteError;

      // Add new assignments
      for (let i = 0; i < selectedLocations.length; i++) {
        const locationGid = selectedLocations[i];
        const isDefaultLocation = defaultLocation === locationGid;
        
        const { error } = await supabase.functions.invoke("user-assignment-admin", {
          body: {
            action: "assign",
            email: userEmail,
            storeKey: selectedManageStore,
            locationGid: locationGid,
            locationName: locations.find(l => l.gid === locationGid)?.name,
            isDefault: isDefaultLocation
          }
        });

        if (error) throw error;
      }

      toast.success(`Assigned ${selectedLocations.length} locations to user`);
      loadAssignments();
      setSelectedLocations([]);
      setDefaultLocation("");
    } catch (e) {
      console.error("Bulk assignment failed:", e);
      toast.error("Bulk assignment failed");
    }
  };

  const handleLocationToggle = (locationGid: string) => {
    setSelectedLocations(prev => {
      if (prev.includes(locationGid)) {
        // If removing the default location, clear default
        if (defaultLocation === locationGid) {
          setDefaultLocation("");
        }
        return prev.filter(l => l !== locationGid);
      } else {
        return [...prev, locationGid];
      }
    });
  };

  const getUserAssignmentsForStore = (userId: string, storeKey: string) => {
    const userPerms = userPermissions.find(up => up.userId === userId);
    return userPerms?.assignments.filter(a => a.store_key === storeKey) || [];
  };

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading assignments...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="manage" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Manage Users
          </TabsTrigger>
          <TabsTrigger value="quick" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Quick Assign
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="space-y-6">
          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>User Location Management</CardTitle>
              <p className="text-sm text-muted-foreground">
                Assign multiple locations to a user and set their default location for better control over what they see in the UI.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bulk-user">Select User</Label>
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bulk-store">Store</Label>
                  <Select value={selectedManageStore} onValueChange={setSelectedManageStore}>
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

              {selectedManageStore && !loadingLocations && (
                <div className="space-y-4">
                  <div>
                    <Label>Available Locations</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Select which locations this user can access. You can also set their default location.
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                      {locations.map((location) => (
                        <div key={location.gid} className="flex items-center justify-between space-x-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`location-${location.gid}`}
                              checked={selectedLocations.includes(location.gid)}
                              onCheckedChange={() => handleLocationToggle(location.gid)}
                            />
                            <Label htmlFor={`location-${location.gid}`}>{location.name}</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`default-${location.gid}`}
                              checked={defaultLocation === location.gid}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setDefaultLocation(location.gid);
                                  // Auto-select this location if not already selected
                                  if (!selectedLocations.includes(location.gid)) {
                                    handleLocationToggle(location.gid);
                                  }
                                } else {
                                  setDefaultLocation("");
                                }
                              }}
                              disabled={!selectedLocations.includes(location.gid)}
                            />
                            <Label htmlFor={`default-${location.gid}`} className="text-xs">Default</Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button 
                    onClick={handleBulkAssign} 
                    disabled={!selectedUser || !selectedManageStore || selectedLocations.length === 0}
                    className="w-full"
                  >
                    Update User Locations ({selectedLocations.length} selected)
                  </Button>
                </div>
              )}

              {selectedUser && selectedManageStore && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-medium mb-2">Current assignments for this user/store:</h4>
                  <div className="space-y-1">
                    {getUserAssignmentsForStore(selectedUser, selectedManageStore).map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between text-sm">
                        <span>{assignment.location_name || assignment.location_gid}</span>
                        {assignment.is_default && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      </div>
                    ))}
                    {getUserAssignmentsForStore(selectedUser, selectedManageStore).length === 0 && (
                      <p className="text-sm text-muted-foreground">No locations assigned</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quick" className="space-y-6">
          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>Quick Assign Single Location</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quickly assign a single user to a specific location.
              </p>
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
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>All User Assignments</CardTitle>
              <p className="text-sm text-muted-foreground">
                Overview of all current user location assignments.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => {
                    const userEmail = users.find(u => u.id === assignment.user_id)?.email || 'Unknown';
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">{userEmail}</TableCell>
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
                    );
                  })}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
