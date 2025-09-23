import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RefreshCw, Store as StoreIcon, ShoppingCart, MapPin, Package, Home, Archive, Tags, Printer, LogOut, Settings, Menu, X } from 'lucide-react';
import { useStore } from '@/contexts/StoreContext';
import { supabase } from '@/integrations/supabase/client';
import { resetLogin } from '@/lib/authUtils';

export function NavigationBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    assignedStore, 
    selectedLocation, 
    setSelectedLocation,
    availableLocations = [],
    loadingLocations,
    refreshLocations,
    userAssignments
  } = useStore();
  
  const [itemsPushed, setItemsPushed] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Use the new verify_user_access function
          const { data: access, error } = await supabase.rpc('verify_user_access', { 
            _user_id: session.user.id 
          });
          
          if (!error && access && typeof access === 'object' && 'has_admin_access' in access && access.has_admin_access) {
            setIsAdmin(true);
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };

    checkAdminStatus();
  }, []);

  // Fetch items pushed count
  useEffect(() => {
    const fetchItemsPushed = async () => {
      try {
        // Simple fallback for items count
        setItemsPushed(0);
      } catch (err) {
        console.error('Error fetching items pushed:', err);
        setItemsPushed(0);
      }
    };
    
    fetchItemsPushed();
  }, []);

  // Auto-select location based on user assignments, falling back to Ward, then first location
  useEffect(() => {
    // Don't auto-select if we already have a location or locations aren't loaded yet
    if (selectedLocation || !availableLocations || availableLocations.length === 0) {
      return;
    }

    // First check if user has a default assignment for current store
    const defaultAssignment = userAssignments?.find(
      a => a.store_key === assignedStore && a.is_default && a.location_gid
    );
    
    if (defaultAssignment?.location_gid && availableLocations.some(loc => loc.gid === defaultAssignment.location_gid)) {
      setSelectedLocation(defaultAssignment.location_gid);
      localStorage.setItem('selected_shopify_location', defaultAssignment.location_gid);
      return;
    }

    // Try to recover from localStorage if it matches available locations
    const savedLocation = localStorage.getItem('selected_shopify_location');
    if (savedLocation && availableLocations.some(loc => loc.gid === savedLocation)) {
      setSelectedLocation(savedLocation);
      return;
    }

    // Auto-select Ward location if no user default
    const wardLocation = availableLocations.find(loc => 
      loc.name && loc.name.toLowerCase().includes('ward')
    );
    
    if (wardLocation?.gid) {
      setSelectedLocation(wardLocation.gid);
      localStorage.setItem('selected_shopify_location', wardLocation.gid);
    } else if (availableLocations[0]?.gid) {
      // Fallback to first location if Ward not found
      setSelectedLocation(availableLocations[0].gid);
      localStorage.setItem('selected_shopify_location', availableLocations[0].gid);
    }
  }, [availableLocations, selectedLocation, setSelectedLocation, userAssignments, assignedStore]);

  const handleLocationChange = (value: string) => {
    if (setSelectedLocation) {
      setSelectedLocation(value);
      localStorage.setItem('selected_shopify_location', value);
      
      // Notify other components of the change
      window.dispatchEvent(new CustomEvent('locationChanged', { 
        detail: { location: value, store: assignedStore }
      }));
    }
  };

  const handleSignOut = async () => {
    await resetLogin();
  };

  // Helper to get location name from GID
  const getLocationName = () => {
    if (loadingLocations) return 'Loading locations...';
    if (!selectedLocation) return 'Select a location';
    
    const location = availableLocations.find(loc => loc.gid === selectedLocation);
    if (location && location.name) {
      return location.name;
    }
    
    // Fallback - show the GID if name not found
    return selectedLocation;
  };

  const getStoreName = () => {
    if (assignedStore === 'hawaii') return 'Hawaii Store';
    if (assignedStore === 'las_vegas') return 'Las Vegas Store';
    return assignedStore || 'No Store Assigned';
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Navigation items
  const navItems = [
    { to: '/', label: 'Dashboard', icon: Home },
    { to: '/inventory', label: 'Inventory', icon: Archive },
    { to: '/batches', label: 'Batches', icon: Package },
    { to: '/labels', label: 'Labels', icon: Tags },
    { to: '/shopify-mapping', label: 'Shopify', icon: ShoppingCart },
    { to: '/print-logs', label: 'Print Logs', icon: Printer },
    { to: '/test-hardware', label: 'Hardware', icon: Settings },
  ];

  if (isAdmin) {
    navItems.push({ to: '/admin', label: 'Admin', icon: Settings });
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card border-b shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          
          {/* LEFT SIDE - Logo/Title & Desktop Navigation */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Inventory Management</h1>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive(item.to)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                    {item.label === 'Admin' && (
                      <Badge variant="outline" className="text-xs ml-1">A</Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* RIGHT SIDE - Store Controls & Mobile Menu */}
          <div className="flex items-center gap-4">
            
            {/* Items Pushed Counter */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{itemsPushed}</span>
              <span className="text-xs text-muted-foreground">pushed</span>
            </div>

            {/* Store Badge */}
            {assignedStore && (
              <Badge variant="secondary" className="text-sm font-medium">
                <StoreIcon className="h-3 w-3 mr-1" />
                {getStoreName()}
              </Badge>
            )}

            {/* Location Selector */}
            {assignedStore && (
              <div className="hidden sm:flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedLocation || ''}
                  onValueChange={handleLocationChange}
                  disabled={loadingLocations || availableLocations.length === 0}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue>
                      {getLocationName()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                     {availableLocations.map((location) => {
                       const isDefault = userAssignments?.some(
                         assignment => assignment.location_gid === location.gid && assignment.is_default
                       );
                       return (
                         <SelectItem key={location.gid} value={location.gid}>
                           <div className="flex items-center gap-2">
                             <span>{location.name}</span>
                             {isDefault && (
                               <Badge variant="outline" className="text-xs">Default</Badge>
                             )}
                           </div>
                         </SelectItem>
                       );
                     })}
                  </SelectContent>
                </Select>

                {/* Refresh Button */}
                {refreshLocations && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={refreshLocations}
                    disabled={loadingLocations}
                    className="h-8 w-8"
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingLocations ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            )}

            {/* Sign Out Button - Always Visible */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>

            {/* Mobile Menu */}
            <DropdownMenu open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link
                        to={item.to}
                        className={`flex items-center gap-2 w-full ${
                          isActive(item.to) ? 'bg-accent' : ''
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                        {item.label === 'Admin' && (
                          <Badge variant="outline" className="text-xs ml-auto">A</Badge>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Warning if no store/location */}
            {!assignedStore && (
              <Badge variant="destructive" className="text-xs">
                No Store Assigned
              </Badge>
            )}
          </div>
        </div>
        
        {/* Mobile Location Selector (when space is limited) */}
        {assignedStore && (
          <div className="sm:hidden mt-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedLocation || ''}
                onValueChange={handleLocationChange}
                disabled={loadingLocations || availableLocations.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {getLocationName()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                   {availableLocations.map((location) => {
                     const isDefault = userAssignments?.some(
                       assignment => assignment.location_gid === location.gid && assignment.is_default
                     );
                     return (
                       <SelectItem key={location.gid} value={location.gid}>
                         <div className="flex items-center gap-2">
                           <span>{location.name}</span>
                           {isDefault && (
                             <Badge variant="outline" className="text-xs">Default</Badge>
                           )}
                         </div>
                       </SelectItem>
                     );
                   })}
                </SelectContent>
              </Select>

              {refreshLocations && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={refreshLocations}
                  disabled={loadingLocations}
                  className="h-8 w-8"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingLocations ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}