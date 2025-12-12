import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GripVertical, MapPin, Loader2, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LocationPriority {
  id: string;
  store_key: string;
  shopify_location_gid: string;
  location_name: string | null;
  priority: number;
  is_active: boolean;
}

interface ShopifyLocation {
  location_gid: string;
  location_name: string | null;
}

interface EbayLocationPriorityProps {
  storeKey: string;
}

export function EbayLocationPriority({ storeKey }: EbayLocationPriorityProps) {
  const [locations, setLocations] = useState<LocationPriority[]>([]);
  const [availableLocations, setAvailableLocations] = useState<ShopifyLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNewLocation, setSelectedNewLocation] = useState<string>('');

  useEffect(() => {
    loadLocations();
    loadAvailableLocations();
  }, [storeKey]);

  const loadLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('ebay_location_priority')
        .select('*')
        .eq('store_key', storeKey)
        .order('priority', { ascending: true });

      if (error) throw error;
      setLocations(data || []);
    } catch (error: any) {
      toast.error('Failed to load location priorities: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableLocations = async () => {
    try {
      // Get distinct locations from intake_items for this store
      const { data, error } = await supabase
        .from('shopify_location_cache')
        .select('location_gid, location_name')
        .eq('store_key', storeKey);

      if (error) throw error;
      setAvailableLocations(data || []);
    } catch (error: any) {
      console.error('Failed to load available locations:', error);
    }
  };

  const addLocation = async () => {
    if (!selectedNewLocation) return;

    const existingLocation = locations.find(l => l.shopify_location_gid === selectedNewLocation);
    if (existingLocation) {
      toast.error('This location is already in the priority list');
      return;
    }

    setSaving(true);
    try {
      const locationInfo = availableLocations.find(l => l.location_gid === selectedNewLocation);
      const maxPriority = Math.max(...locations.map(l => l.priority), -1);

      const { data, error } = await supabase
        .from('ebay_location_priority')
        .insert({
          store_key: storeKey,
          shopify_location_gid: selectedNewLocation,
          location_name: locationInfo?.location_name || null,
          priority: maxPriority + 1,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setLocations([...locations, data]);
      setSelectedNewLocation('');
      toast.success('Location added to priority list');
    } catch (error: any) {
      toast.error('Failed to add location: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const removeLocation = async (id: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ebay_location_priority')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setLocations(locations.filter(l => l.id !== id));
      toast.success('Location removed');
    } catch (error: any) {
      toast.error('Failed to remove location: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('ebay_location_priority')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setLocations(locations.map(l => 
        l.id === id ? { ...l, is_active: isActive } : l
      ));
    } catch (error: any) {
      toast.error('Failed to update location: ' + error.message);
    }
  };

  const movePriority = async (id: string, direction: 'up' | 'down') => {
    const currentIndex = locations.findIndex(l => l.id === id);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= locations.length) return;

    setSaving(true);
    try {
      const newLocations = [...locations];
      [newLocations[currentIndex], newLocations[newIndex]] = [newLocations[newIndex], newLocations[currentIndex]];
      
      // Update priorities in database
      const updates = newLocations.map((loc, idx) => 
        supabase
          .from('ebay_location_priority')
          .update({ priority: idx })
          .eq('id', loc.id)
      );

      await Promise.all(updates);
      
      setLocations(newLocations.map((loc, idx) => ({ ...loc, priority: idx })));
    } catch (error: any) {
      toast.error('Failed to reorder: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const unusedLocations = availableLocations.filter(
    al => !locations.some(l => l.shopify_location_gid === al.location_gid)
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Location Priority (Waterfall Fulfillment)
        </CardTitle>
        <CardDescription>
          Set the order in which locations are used when fulfilling eBay orders. 
          Items will be decremented from the highest priority location first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new location */}
        {unusedLocations.length > 0 && (
          <div className="flex gap-2">
            <Select value={selectedNewLocation} onValueChange={setSelectedNewLocation}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a location to add..." />
              </SelectTrigger>
              <SelectContent>
                {unusedLocations.map(loc => (
                  <SelectItem key={loc.location_gid} value={loc.location_gid}>
                    {loc.location_name || loc.location_gid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addLocation} disabled={!selectedNewLocation || saving}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        )}

        {/* Priority list */}
        {locations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No locations configured yet.</p>
            <p className="text-sm">Add locations to set up waterfall fulfillment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map((location, index) => (
              <div
                key={location.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  location.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="w-8 justify-center">
                    {index + 1}
                  </Badge>
                </div>
                
                <div className="flex-1">
                  <p className="font-medium">
                    {location.location_name || location.shopify_location_gid}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {location.shopify_location_gid}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => movePriority(location.id, 'up')}
                    disabled={index === 0 || saving}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => movePriority(location.id, 'down')}
                    disabled={index === locations.length - 1 || saving}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  
                  <Switch
                    checked={location.is_active}
                    onCheckedChange={(checked) => toggleActive(location.id, checked)}
                  />
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLocation(location.id)}
                    disabled={saving}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
