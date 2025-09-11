import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";
import { Users, Plus, Pencil, Trash2, ShieldCheck, Store, MapPin, KeyRound, RotateCcw } from "lucide-react";
import { logger } from "@/lib/logger";

interface UserAssignment {
  id: string;
  user_id: string;
  store_key: string;
  location_gid: string;
  location_name: string | null;
  is_default: boolean;
}

interface UserWithDetails {
  id: string;
  email: string;
  roles: string[];
  storeAssignments: {
    [storeKey: string]: {
      storeName: string;
      locations: {
        gid: string;
        name: string;
        isDefault: boolean;
      }[];
    };
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

export function UserAssignmentManager() {
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithDetails | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    roles: [] as string[],
    selectedStores: [] as string[],
    storeLocations: {} as { [storeKey: string]: string[] },
    defaultLocations: {} as { [storeKey: string]: string }
  });

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      roles: [],
      selectedStores: [],
      storeLocations: {},
      defaultLocations: {}
    });
    setEditingUser(null);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadUsers(), loadStores()]);
    } catch (error) {
      console.error("Failed to load data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load data";
      setError(errorMessage);
      toast.error(`Failed to load data: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      console.log("Loading users from roles-admin function...");
      
      // Load users from auth system with bootstrap fallback
      let authData: any = null;
      let resp = await supabase.functions.invoke("roles-admin", { body: { action: "list" } });

      console.log("roles-admin response:", resp);

      if (resp.error || !resp.data?.ok) {
        console.log("Initial call failed, attempting bootstrap...");
        // Attempt to restore admin role if missing, then retry once
        try { 
          const bootstrapResp = await supabase.functions.invoke("bootstrap-admin", { body: {} }); 
          console.log("bootstrap response:", bootstrapResp);
        } catch (bootstrapError) {
          console.error("Bootstrap failed:", bootstrapError);
        }
        resp = await supabase.functions.invoke("roles-admin", { body: { action: "list" } });
        console.log("retry roles-admin response:", resp);
      }

      if (resp.error) {
        console.error("roles-admin error:", resp.error);
        throw resp.error;
      }
      
      authData = resp.data;
      if (!authData?.ok) {
        const errorMsg = authData?.error || "Failed to load users";
        console.error("Auth data error:", errorMsg);
        throw new Error(errorMsg);
      }

      console.log("Successfully loaded users:", authData.users?.length || 0, "users");

      // Load assignments
      const { data: assignments, error: assignError } = await supabase
        .from("user_shopify_assignments")
        .select(`
          id, user_id, store_key, location_gid, location_name, is_default
        `);

      if (assignError) {
        console.error("Assignment loading error:", assignError);
        throw assignError;
      }

      // Combine data
      const usersWithDetails: UserWithDetails[] = [];
      
      if (authData?.users) {
        for (const authUser of authData.users) {
          const userAssignments = assignments?.filter(a => a.user_id === authUser.id) || [];
          const storeAssignments: { [storeKey: string]: any } = {};

          // Group assignments by store
          userAssignments.forEach(assignment => {
            if (!storeAssignments[assignment.store_key]) {
              storeAssignments[assignment.store_key] = {
                storeName: stores.find(s => s.key === assignment.store_key)?.name || assignment.store_key,
                locations: []
              };
            }
            storeAssignments[assignment.store_key].locations.push({
              gid: assignment.location_gid,
              name: assignment.location_name || assignment.location_gid,
              isDefault: assignment.is_default
            });
          });

          usersWithDetails.push({
            id: authUser.id,
            email: authUser.email || 'No email',
            roles: authUser.roles || [],
            storeAssignments
          });
        }
      }

      setUsers(usersWithDetails);
    } catch (error) {
      console.error("Failed to load users:", error);
      // Re-throw the error so loadData can handle it properly
      throw error;
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
    } catch (error) {
      console.error("Failed to load stores:", error);
      // Re-throw the error so loadData can handle it properly
      throw error;
    }
  };

  const loadLocationsForStore = async (storeKey: string) => {
    if (!storeKey) return [];

    try {
      const { data, error } = await supabase.functions.invoke("shopify-locations", {
        body: { storeKey }
      });
      
      if (error) throw error;
      
      if (data?.ok && data?.locations) {
        return data.locations.map((loc: any) => ({
          id: String(loc.id),
          name: loc.name,
          gid: `gid://shopify/Location/${loc.id}`
        }));
      }
      return [];
    } catch (error) {
      console.error("Failed to load locations:", error);
      return [];
    }
  };

  const handleStoreSelection = async (storeKey: string, checked: boolean) => {
    if (checked) {
      // Add store
      setFormData(prev => ({
        ...prev,
        selectedStores: [...prev.selectedStores, storeKey]
      }));

      // Load locations for this store
      setLoadingLocations(true);
      const storeLocations = await loadLocationsForStore(storeKey);
      setLoadingLocations(false);

      // Auto-select all locations and set first as default
      setFormData(prev => ({
        ...prev,
        storeLocations: {
          ...prev.storeLocations,
          [storeKey]: storeLocations.map(l => l.gid)
        },
        defaultLocations: {
          ...prev.defaultLocations,
          [storeKey]: storeLocations[0]?.gid || ""
        }
      }));
    } else {
      // Remove store
      setFormData(prev => {
        const newStoreLocations = { ...prev.storeLocations };
        const newDefaultLocations = { ...prev.defaultLocations };
        delete newStoreLocations[storeKey];
        delete newDefaultLocations[storeKey];

        return {
          ...prev,
          selectedStores: prev.selectedStores.filter(s => s !== storeKey),
          storeLocations: newStoreLocations,
          defaultLocations: newDefaultLocations
        };
      });
    }
  };

  const handleLocationToggle = async (storeKey: string, locationGid: string, checked: boolean) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        storeLocations: {
          ...prev.storeLocations,
          [storeKey]: [...(prev.storeLocations[storeKey] || []), locationGid]
        }
      }));
    } else {
      setFormData(prev => {
        const newLocations = (prev.storeLocations[storeKey] || []).filter(l => l !== locationGid);
        const newDefaults = { ...prev.defaultLocations };
        
        // Clear default if removing the default location
        if (prev.defaultLocations[storeKey] === locationGid) {
          newDefaults[storeKey] = newLocations[0] || "";
        }

        return {
          ...prev,
          storeLocations: {
            ...prev.storeLocations,
            [storeKey]: newLocations
          },
          defaultLocations: newDefaults
        };
      });
    }
  };

  const handleSaveUser = async () => {
    if (!formData.email) {
      toast.error("Email is required");
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error("Password is required for new users");
      return;
    }

    try {
      if (editingUser) {
        // Update existing user
        const storeAssignments = [];
        
        for (const storeKey of formData.selectedStores) {
          const storeLocations = formData.storeLocations[storeKey] || [];
          const defaultLocation = formData.defaultLocations[storeKey];
          
          for (const locationGid of storeLocations) {
            // Get location details
            const locations = await loadLocationsForStore(storeKey);
            const location = locations.find(l => l.gid === locationGid);
            
            storeAssignments.push({
              storeKey,
              locationGid,
              locationName: location?.name || locationGid,
              isDefault: locationGid === defaultLocation
            });
          }
        }

        const { data, error } = await supabase.functions.invoke('user-assignment-admin', {
          body: {
            action: "update",
            userId: editingUser.id,
            email: formData.email,
            roles: formData.roles.length > 0 ? formData.roles : ['staff'],
            storeAssignments
          }
        });

        if (error) throw error;
        if (!data.ok) throw new Error(data.error);

        toast.success("User updated successfully!");
      } else {
        // Create new user
        const storeAssignments = [];
        
        for (const storeKey of formData.selectedStores) {
          const storeLocations = formData.storeLocations[storeKey] || [];
          const defaultLocation = formData.defaultLocations[storeKey];
          
          for (const locationGid of storeLocations) {
            // Get location details
            const locations = await loadLocationsForStore(storeKey);
            const location = locations.find(l => l.gid === locationGid);
            
            storeAssignments.push({
              storeKey,
              locationGid,
              locationName: location?.name || locationGid,
              isDefault: locationGid === defaultLocation
            });
          }
        }

        const { data, error } = await supabase.functions.invoke('create-user-admin', {
          body: {
            email: formData.email,
            password: formData.password,
            roles: formData.roles.length > 0 ? formData.roles : ['staff'],
            storeAssignments
          }
        });

        if (error) throw error;
        if (!data.ok) throw new Error(data.error);

        toast.success("User created successfully!");
      }

      setDialogOpen(false);
      resetForm();
      await loadData();
    } catch (error: any) {
      console.error("Failed to save user:", error);
      toast.error(`Failed to save user: ${error.message}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("roles-admin", {
        body: { action: "delete", userId }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast.success("User deleted successfully");
      await loadData();
    } catch (error: any) {
      console.error("Failed to delete user:", error);
      toast.error(`Failed to delete user: ${error.message}`);
    }
  };

  const openEditDialog = (user: UserWithDetails) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: "",
      roles: user.roles,
      selectedStores: Object.keys(user.storeAssignments),
      storeLocations: Object.fromEntries(
        Object.entries(user.storeAssignments).map(([storeKey, data]) => [
          storeKey,
          data.locations.map(l => l.gid)
        ])
      ),
      defaultLocations: Object.fromEntries(
        Object.entries(user.storeAssignments).map(([storeKey, data]) => [
          storeKey,
          data.locations.find(l => l.isDefault)?.gid || ""
        ])
      )
    });
    setDialogOpen(true);
  };

  const handleResetPassword = async (userId: string, email: string) => {
    if (!confirm(`Reset password for ${email}? A new temporary password will be generated.`)) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { userId }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      toast.success(`Password reset for ${email}. New password: ${data.newPassword}`);
    } catch (error: any) {
      console.error("Failed to reset password:", error);
      toast.error(`Failed to reset password: ${error.message}`);
    }
  };

  useEffect(() => {
    const checkAdminRole = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (session?.session?.user) {
          const { data: adminCheck } = await supabase.rpc("has_role", { 
            _user_id: session.session.user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(adminCheck));
        }
      } catch (error) {
        console.error('Error checking admin role:', error);
      }
    };

    checkAdminRole();
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Loading users and assignments...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-destructive mb-2">Error loading users</div>
        <div className="text-sm text-muted-foreground mb-4">{error}</div>
        <Button onClick={loadData} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground">Manage users, roles, and store access</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingUser ? "Edit User" : "Create New User"}
              </DialogTitle>
              <DialogDescription>
                Set up user account, roles, and store access permissions.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Account Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="user@example.com"
                      disabled={!!editingUser}
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">
                      Password {editingUser ? "(leave blank to keep current)" : "*"}
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingUser ? "Leave blank to keep current password" : "Required"}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Roles */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  <h3 className="text-lg font-medium">User Roles</h3>
                </div>
                <div className="flex gap-4">
                  {['staff', 'admin'].map(role => (
                    <div key={role} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role}`}
                        checked={formData.roles.includes(role)}
              onCheckedChange={(checked) => {
                if (!!checked) {
                  setFormData(prev => ({ ...prev, roles: [...prev.roles, role] }));
                } else {
                  setFormData(prev => ({ ...prev, roles: prev.roles.filter(r => r !== role) }));
                }
              }}
                      />
                      <Label htmlFor={`role-${role}`} className="capitalize font-medium">
                        {role}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Store Access */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  <h3 className="text-lg font-medium">Store Access</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select which stores this user can access. For each store, you can choose specific locations.
                </p>
                
                <div className="space-y-4">
                  {stores.map(store => (
                    <Card key={store.key} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <Checkbox
                            id={`store-${store.key}`}
                            checked={formData.selectedStores.includes(store.key)}
                            onCheckedChange={(checked) => handleStoreSelection(store.key, !!checked)}
                          />
                          <Label htmlFor={`store-${store.key}`} className="font-medium">
                            {store.name}
                          </Label>
                        </div>
                        
                        {formData.selectedStores.includes(store.key) && (
                          <div className="ml-6 space-y-3">
                            {loadingLocations ? (
                              <div className="text-sm text-muted-foreground">Loading locations...</div>
                            ) : (
                              <StoreLocationSelector
                                storeKey={store.key}
                                selectedLocations={formData.storeLocations[store.key] || []}
                                defaultLocation={formData.defaultLocations[store.key] || ""}
                                onLocationToggle={(locationGid, checked) => handleLocationToggle(store.key, locationGid, checked)}
                                onDefaultChange={(locationGid) => setFormData(prev => ({
                                  ...prev,
                                  defaultLocations: { ...prev.defaultLocations, [store.key]: locationGid }
                                }))}
                              />
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSaveUser} className="flex-1">
                  {editingUser ? "Update User" : "Create User"}
                </Button>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Store Access</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {user.roles.map(role => (
                        <Badge key={role} variant={role === 'admin' ? 'default' : 'secondary'}>
                          {role}
                        </Badge>
                      ))}
                      {user.roles.length === 0 && (
                        <Badge variant="outline">No roles</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {Object.entries(user.storeAssignments).map(([storeKey, storeData]) => (
                        <div key={storeKey} className="text-sm">
                          <span className="font-medium">{storeData.storeName}</span>
                          <span className="text-muted-foreground ml-1">
                            ({storeData.locations.length} location{storeData.locations.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      ))}
                      {Object.keys(user.storeAssignments).length === 0 && (
                        <span className="text-sm text-muted-foreground">No store access</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        title="Edit user"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResetPassword(user.id, user.email)}
                        title="Reset password"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Component for managing locations within a store
function StoreLocationSelector({
  storeKey,
  selectedLocations,
  defaultLocation,
  onLocationToggle,
  onDefaultChange
}: {
  storeKey: string;
  selectedLocations: string[];
  defaultLocation: string;
  onLocationToggle: (locationGid: string, checked: boolean) => void;
  onDefaultChange: (locationGid: string) => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadLocations = async () => {
      setLoading(true);
      try {
        console.log(`Loading locations for store: ${storeKey}`);
        const { data, error } = await supabase.functions.invoke("shopify-locations", {
          body: { storeKey }
        });
        
        console.log(`Shopify locations response:`, { data, error });
        
        if (error) {
          console.error("Supabase function error:", error);
          throw error;
        }
        
        if (data?.ok && data?.locations) {
          const mappedLocations = data.locations.map((loc: any) => ({
            id: String(loc.id),
            name: loc.name,
            gid: `gid://shopify/Location/${loc.id}`
          }));
          console.log(`Mapped locations:`, mappedLocations);
          setLocations(mappedLocations);
        } else {
          console.warn("No locations returned or invalid response:", data);
          if (data?.error) {
            throw new Error(data.error);
          }
        }
      } catch (error) {
        console.error("Failed to load locations for store", storeKey, ":", error);
        toast.error(`Failed to load locations for store ${storeKey}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setLoading(false);
      }
    };

    loadLocations();
  }, [storeKey]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading locations...</div>;
  }

  if (locations.length === 0) {
    return <div className="text-sm text-muted-foreground">No locations found</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="h-4 w-4" />
        <Label className="text-sm font-medium">Locations</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const allSelected = locations.every(l => selectedLocations.includes(l.gid));
            locations.forEach(location => {
              if (!allSelected && !selectedLocations.includes(location.gid)) {
                onLocationToggle(location.gid, true);
              } else if (allSelected) {
                onLocationToggle(location.gid, false);
              }
            });
          }}
        >
          {locations.every(l => selectedLocations.includes(l.gid)) ? 'Deselect All' : 'Select All'}
        </Button>
      </div>
      
      <div className="space-y-2 max-h-32 overflow-y-auto border rounded p-2">
        {locations.map(location => (
          <div key={location.gid} className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`location-${location.gid}`}
                checked={selectedLocations.includes(location.gid)}
                onCheckedChange={(checked) => onLocationToggle(location.gid, !!checked)}
              />
              <Label htmlFor={`location-${location.gid}`} className="text-sm">
                {location.name}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id={`default-${location.gid}`}
                checked={defaultLocation === location.gid}
                onCheckedChange={(checked) => {
                  if (!!checked) {
                    onDefaultChange(location.gid);
                    if (!selectedLocations.includes(location.gid)) {
                      onLocationToggle(location.gid, true);
                    }
                  } else {
                    onDefaultChange("");
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
  );
}