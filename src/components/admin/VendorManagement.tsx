import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Star } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Vendor {
  id: string;
  store_key: string;
  location_gid: string;
  vendor_name: string;
  is_default: boolean;
}

interface Store {
  key: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

export function VendorManagement() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [newVendorName, setNewVendorName] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Load stores
  useEffect(() => {
    loadStores();
  }, []);

  // Load locations when store changes
  useEffect(() => {
    if (selectedStore) {
      loadLocations(selectedStore);
    }
  }, [selectedStore]);

  // Load vendors when location changes
  useEffect(() => {
    if (selectedStore && selectedLocation) {
      loadVendors();
    }
  }, [selectedStore, selectedLocation]);

  const loadStores = async () => {
    try {
      const { data, error } = await supabase
        .from('shopify_stores')
        .select('key, name')
        .order('name');

      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error('Failed to load stores:', error);
      toast.error('Failed to load stores');
    }
  };

  const loadLocations = async (storeKey: string) => {
    try {
      const { data, error } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name')
        .eq('store_key', storeKey)
        .order('location_name');

      if (error) throw error;
      
      const uniqueLocations = (data || []).reduce((acc, loc) => {
        if (!acc.find(l => l.id === loc.location_gid)) {
          acc.push({ id: loc.location_gid, name: loc.location_name || loc.location_gid });
        }
        return acc;
      }, [] as Location[]);
      
      setLocations(uniqueLocations);
    } catch (error) {
      console.error('Failed to load locations:', error);
      toast.error('Failed to load locations');
    }
  };

  const loadVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('shopify_location_vendors')
        .select('*')
        .eq('store_key', selectedStore)
        .eq('location_gid', selectedLocation)
        .order('vendor_name');

      if (error) throw error;
      setVendors(data || []);
    } catch (error) {
      console.error('Failed to load vendors:', error);
      toast.error('Failed to load vendors');
    }
  };

  const addVendor = async () => {
    if (!newVendorName.trim()) {
      toast.error('Please enter a vendor name');
      return;
    }

    if (!selectedStore || !selectedLocation) {
      toast.error('Please select a store and location');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('shopify_location_vendors')
        .insert({
          store_key: selectedStore,
          location_gid: selectedLocation,
          vendor_name: newVendorName.trim(),
          is_default: vendors.length === 0 // First vendor is default
        });

      if (error) throw error;

      toast.success('Vendor added successfully');
      setNewVendorName('');
      loadVendors();
    } catch (error) {
      console.error('Failed to add vendor:', error);
      toast.error('Failed to add vendor');
    } finally {
      setLoading(false);
    }
  };

  const setDefaultVendor = async (vendorId: string) => {
    setLoading(true);
    try {
      // Remove default from all vendors at this location
      await supabase
        .from('shopify_location_vendors')
        .update({ is_default: false })
        .eq('store_key', selectedStore)
        .eq('location_gid', selectedLocation);

      // Set new default
      const { error } = await supabase
        .from('shopify_location_vendors')
        .update({ is_default: true })
        .eq('id', vendorId);

      if (error) throw error;

      toast.success('Default vendor updated');
      loadVendors();
    } catch (error) {
      console.error('Failed to set default vendor:', error);
      toast.error('Failed to set default vendor');
    } finally {
      setLoading(false);
    }
  };

  const deleteVendor = async (vendorId: string) => {
    if (!confirm('Are you sure you want to delete this vendor?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('shopify_location_vendors')
        .delete()
        .eq('id', vendorId);

      if (error) throw error;

      toast.success('Vendor deleted successfully');
      loadVendors();
    } catch (error) {
      console.error('Failed to delete vendor:', error);
      toast.error('Failed to delete vendor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Management</CardTitle>
        <CardDescription>
          Configure vendors for each store location. Vendors will appear in the batch intake dropdown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Store & Location Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Store</Label>
            <Select value={selectedStore} onValueChange={setSelectedStore}>
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

          <div className="space-y-2">
            <Label>Location</Label>
            <Select 
              value={selectedLocation} 
              onValueChange={setSelectedLocation}
              disabled={!selectedStore}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedStore && selectedLocation && (
          <>
            {/* Add New Vendor */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Enter vendor name (e.g., Pokémon Company)"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addVendor();
                    }
                  }}
                />
              </div>
              <Button onClick={addVendor} disabled={loading}>
                <Plus className="w-4 h-4 mr-2" />
                Add Vendor
              </Button>
            </div>

            {/* Vendor List */}
            {vendors.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No vendors configured for this location. Add your first vendor above.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label>Configured Vendors</Label>
                <div className="space-y-2">
                  {vendors.map((vendor) => (
                    <div
                      key={vendor.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{vendor.vendor_name}</span>
                        {vendor.is_default && (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="w-3 h-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {!vendor.is_default && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDefaultVendor(vendor.id)}
                            disabled={loading}
                          >
                            Set as Default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteVendor(vendor.id)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
