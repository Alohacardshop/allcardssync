
import { useState, useEffect, useMemo } from "react";
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
import { Users, MapPin, Settings, Building } from "lucide-react";

interface UserAssignment {
  id: string;
  user_id: string;
  store_key: string;
  location_gid: string;
  location_name: string | null;
  is_default: boolean;
  shopify_stores?: {
    name: string;
  } | null;
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
  const [selectedQuickLocations, setSelectedQuickLocations] = useState<string[]>([]);
  const [quickDefaultLocation, setQuickDefaultLocation] = useState("");
  
  // Form state for multi-store assignment
  const [multiStoreUser, setMultiStoreUser] = useState("");
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  
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
          is_default
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
    Promise.all([loadAssignments(), loadStores()])
      .finally(() => setLoading(false));
    
    // Load users in background (can be slow)
    loadUsers();
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

  const handleQuickAssign = async () => {
    if (!email || !selectedAssignStore || selectedQuickLocations.length === 0) {
      toast.error("Please fill all fields and select at least one location");
      return;
    }

    try {
      // Add assignments for each selected location
      for (let i = 0; i < selectedQuickLocations.length; i++) {
        const locationGid = selectedQuickLocations[i];
        const isDefaultLocation = quickDefaultLocation === locationGid;
        
        const { data, error } = await supabase.functions.invoke("user-assignment-admin", {
          body: {
            action: "assign",
            email,
            storeKey: selectedAssignStore,
            locationGid: locationGid,
            locationName: locations.find(l => l.gid === locationGid)?.name,
            isDefault: isDefaultLocation
          }
        });

        if (error) throw error;
        
        const result: any = data;
        if (!result?.ok) throw new Error(result?.error || "Assignment failed");
      }

      toast.success(`User assigned to ${selectedQuickLocations.length} location${selectedQuickLocations.length > 1 ? 's' : ''} successfully`);
      loadAssignments();
      setEmail("");
      setSelectedQuickLocations([]);
      setQuickDefaultLocation("");
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

  const handleMultiStoreAssign = async () => {
    if (!multiStoreUser || selectedStores.length === 0) {
      toast.error("Please select user and at least one store");
      return;
    }

    const userEmail = users.find(u => u.id === multiStoreUser)?.email;
    if (!userEmail) {
      toast.error("User email not found");
      return;
    }

    try {
      // For each selected store, get all locations and assign user to all of them
      for (const storeKey of selectedStores) {
        // Get locations for this store
        const { data, error } = await supabase.functions.invoke("shopify-locations", {
          body: { storeKey }
        });
        
        if (error) throw error;
        
        if (data?.ok && data?.locations) {
          const storeLocations = data.locations.map((loc: any) => ({
            id: String(loc.id),
            name: loc.name,
            gid: `gid://shopify/Location/${loc.id}`
          }));

          // Assign user to all locations in this store
          for (let i = 0; i < storeLocations.length; i++) {
            const location = storeLocations[i];
            const isDefaultLocation = i === 0; // Make first location default
            
            const { error: assignError } = await supabase.functions.invoke("user-assignment-admin", {
              body: {
                action: "assign",
                email: userEmail,
                storeKey: storeKey,
                locationGid: location.gid,
                locationName: location.name,
                isDefault: isDefaultLocation
              }
            });

            if (assignError) throw assignError;
          }
        }
      }

      toast.success(`User assigned to ${selectedStores.length} store${selectedStores.length !== 1 ? 's' : ''} successfully`);
      loadAssignments();
      setSelectedStores([]);
    } catch (e) {
      console.error("Multi-store assignment failed:", e);
      toast.error("Multi-store assignment failed");
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

  const handleQuickLocationToggle = (locationGid: string) => {
    setSelectedQuickLocations(prev => {
      if (prev.includes(locationGid)) {
        // If removing the default location, clear default
        if (quickDefaultLocation === locationGid) {
          setQuickDefaultLocation("");
        }
        return prev.filter(l => l !== locationGid);
      } else {
        return [...prev, locationGid];
      }
    });
  };

  const handleSelectAllQuickLocations = () => {
    setSelectedQuickLocations(locations.map(l => l.gid));
  };

  const handleClearQuickLocations = () => {
    setSelectedQuickLocations([]);
    setQuickDefaultLocation("");
  };

  const getUserAssignmentsForStore = (userId: string, storeKey: string) => {
    const userPerms = userPermissions.find(up => up.userId === userId);
    return userPerms?.assignments.filter(a => a.store_key === storeKey) || [];
  };

  // Create a memoized stores map for fallback store names
  const storesMap = useMemo(() => {
    return stores.reduce((acc, store) => {
      acc[store.key] = store.name;
      return acc;
    }, {} as Record<string, string>);
  }, [stores]);

  // Helper function to get store name with fallbacks
  const getStoreName = (assignment: UserAssignment) => {
    return storesMap[assignment.store_key] || 
           assignment.shopify_stores?.name || 
           assignment.store_key;
  };

  if (loading) {
    return <div className="text-center text-muted-foreground">Loading assignments...</div>;
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="manage" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Manage Users
          </TabsTrigger>
          <TabsTrigger value="multi-store" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Multi-Store
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

        <TabsContent value="multi-store" className="space-y-6">
          <Card className="shadow-aloha">
            <CardHeader>
              <CardTitle>Multi-Store Assignment</CardTitle>
              <p className="text-sm text-muted-foreground">
                Assign a user to access multiple stores at once.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="multi-store-user">Select User</Label>
                <Select value={multiStoreUser} onValueChange={setMultiStoreUser}>
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
                <Label>Available Stores</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Select which stores this user should have access to. They will be assigned to all locations in each store.
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                  {stores.map((store) => (
                    <div key={store.key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`store-${store.key}`}
                        checked={selectedStores.includes(store.key)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedStores(prev => [...prev, store.key]);
                          } else {
                            setSelectedStores(prev => prev.filter(s => s !== store.key));
                          }
                        }}
                      />
                      <Label htmlFor={`store-${store.key}`}>{store.name}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                onClick={() => handleMultiStoreAssign()} 
                disabled={!multiStoreUser || selectedStores.length === 0}
                className="w-full"
              >
                Assign User to {selectedStores.length} Store{selectedStores.length !== 1 ? 's' : ''}
              </Button>

              {multiStoreUser && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                  <h4 className="font-medium mb-2">Current store assignments for this user:</h4>
                  <div className="space-y-1">
                    {Array.from(new Set(
                      userPermissions
                        .find(up => up.userId === multiStoreUser)?.assignments
                        .map(a => a.store_key) || []
                    )).map((storeKey) => (
                      <div key={storeKey} className="flex items-center justify-between text-sm">
                        <span>{storesMap[storeKey] || storeKey}</span>
                        <Badge variant="outline" className="text-xs">
                          {getUserAssignmentsForStore(multiStoreUser, storeKey).length} locations
                        </Badge>
                      </div>
                    ))}
                    {(!userPermissions.find(up => up.userId === multiStoreUser)?.assignments.length) && (
                      <p className="text-sm text-muted-foreground">No store assignments</p>
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
              <CardTitle>Quick Assign Multiple Locations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Quickly assign a user to multiple locations at once.
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
              
              {selectedAssignStore && !loadingLocations && (
                <div className="space-y-4">
                  <div>
                    <Label>Available Locations</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Select which locations to assign to this user. You can also set their default location.
                    </p>
                    <div className="flex gap-2 mb-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleSelectAllQuickLocations}
                        disabled={locations.length === 0}
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleClearQuickLocations}
                        disabled={selectedQuickLocations.length === 0}
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-3">
                      {locations.map((location) => (
                        <div key={location.gid} className="flex items-center justify-between space-x-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`quick-location-${location.gid}`}
                              checked={selectedQuickLocations.includes(location.gid)}
                              onCheckedChange={() => handleQuickLocationToggle(location.gid)}
                            />
                            <Label htmlFor={`quick-location-${location.gid}`}>{location.name}</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`quick-default-${location.gid}`}
                              checked={quickDefaultLocation === location.gid}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setQuickDefaultLocation(location.gid);
                                  // Auto-select this location if not already selected
                                  if (!selectedQuickLocations.includes(location.gid)) {
                                    handleQuickLocationToggle(location.gid);
                                  }
                                } else {
                                  setQuickDefaultLocation("");
                                }
                              }}
                              disabled={!selectedQuickLocations.includes(location.gid)}
                            />
                            <Label htmlFor={`quick-default-${location.gid}`} className="text-xs">Default</Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button 
                    onClick={handleQuickAssign} 
                    disabled={!email || !selectedAssignStore || selectedQuickLocations.length === 0}
                    className="w-full"
                  >
                    Assign User to {selectedQuickLocations.length} Location{selectedQuickLocations.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              )}
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
                        <TableCell>{getStoreName(assignment)}</TableCell>
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
