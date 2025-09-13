import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Package, Tags, Settings, FileText, Menu, LogOut, Upload, BarChart3, Archive, MapPin, Palmtree, Dice1 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanupAuthState } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useStore } from "@/contexts/StoreContext";

interface NavigationProps {
  showMobileMenu?: boolean;
}

export function Navigation({ showMobileMenu = true }: NavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Store context for universal store switching
  const { 
    selectedStore, 
    selectedLocation, 
    availableStores, 
    availableLocations, 
    setSelectedStore,
    setSelectedLocation,
    loadingStores,
    userAssignments 
  } = useStore();
  
  const [userStores, setUserStores] = useState<string[]>([]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase.rpc("has_role", { 
            _user_id: session.user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(data));
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Role check failed", error);
        }
        setIsAdmin(false);
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          const { data } = await supabase.rpc("has_role", { 
            _user_id: session.user.id, 
            _role: "admin" as any 
          });
          setIsAdmin(Boolean(data));
        } else {
          setIsAdmin(false);
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Role check failed in auth state change", error);
        }
        setIsAdmin(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Set user stores from assignments
  useEffect(() => {
    if (userAssignments && userAssignments.length > 0) {
      const uniqueStores = [...new Set(userAssignments.map(assignment => assignment.store_key))];
      setUserStores(uniqueStores);
    }
  }, [userAssignments]);

  const handleSignOut = async () => {
    try {
      cleanupAuthState();
      try { 
        await supabase.auth.signOut({ scope: 'global' } as any); 
      } catch {}
    } finally {
      navigate('/auth', { replace: true });
    }
  };

  // Store switching helpers
  const getStoreIcon = (storeKey: string) => {
    switch (storeKey) {
      case 'hawaii':
        return <Palmtree className="h-4 w-4" />;
      case 'las_vegas':
        return <Dice1 className="h-4 w-4" />;
      default:
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getStoreName = (storeKey: string) => {
    const store = availableStores.find(s => s.key === storeKey);
    return store?.name || storeKey.replace('_', ' ').toUpperCase();
  };

  const getLocationName = (gid: string) => {
    const location = availableLocations.find(l => l.gid === gid);
    return location?.name || 'Select Location';
  };

  const handleStoreSelect = (storeKey: string) => {
    setSelectedStore(storeKey);
    // Auto-select first available location for the store
    const storeAssignments = userAssignments?.filter(a => a.store_key === storeKey) || [];
    if (storeAssignments.length > 0) {
      setSelectedLocation(storeAssignments[0].location_gid || '');
    }
  };

  // Store selector component for navigation
  const StoreSelector = () => {
    // Only show if user has access to multiple stores
    if (loadingStores || userStores.length <= 1) {
      return null;
    }

    return (
      <div className="flex items-center gap-2">
        {userStores.map((storeKey) => {
          const isActive = selectedStore === storeKey;
          const storeName = getStoreName(storeKey);
          const locationName = selectedLocation && isActive ? getLocationName(selectedLocation) : null;
          
          return (
            <Button
              key={storeKey}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => handleStoreSelect(storeKey)}
              className={`flex items-center gap-2 h-8 ${
                isActive 
                  ? storeKey === 'hawaii' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' 
                    : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                  : 'hover:bg-muted'
              }`}
            >
              {getStoreIcon(storeKey)}
              <span className="font-medium">{storeName}</span>
              {isActive && locationName && (
                <Badge 
                  variant="secondary" 
                  className={`ml-1 text-xs ${
                    storeKey === 'hawaii' 
                      ? 'bg-blue-100 text-blue-800 border-blue-200' 
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {locationName}
                </Badge>
              )}
            </Button>
          );
        })}
        {selectedStore && selectedLocation && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Active
          </Badge>
        )}
      </div>
    );
  };

  const navItems = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/batches", label: "Batches", icon: Archive },
    { to: "/labels", label: "Labels", icon: Tags },
    { to: "/shopify-mapping", label: "Shopify", icon: FileText },
    { to: "/print-logs", label: "Print Logs", icon: FileText },
  ];

  if (isAdmin) {
    navItems.push(
      { to: "/admin", label: "Admin", icon: Settings }
    );
  }

  const isActive = (path: string) => location.pathname === path;

  // Desktop Navigation
  const DesktopNav = () => (
    <nav className="hidden md:flex items-center space-x-1">
      {navItems.map((item) => (
        <Link key={item.to} to={item.to}>
          <Button 
            variant={isActive(item.to) ? "default" : "ghost"} 
            size="sm"
            className="flex items-center gap-2"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.label === "Admin" && (
              <Badge variant="secondary" className="ml-1">Admin</Badge>
            )}
          </Button>
        </Link>
      ))}
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={handleSignOut}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </nav>
  );

  // Mobile Navigation - Include store selector
  const MobileNav = () => (
    <div className="md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Menu className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {navItems.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <Link 
                to={item.to} 
                className={`flex items-center gap-2 w-full ${
                  isActive(item.to) ? 'bg-accent' : ''
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.label === "Admin" && (
                  <Badge variant="secondary" className="ml-auto">Admin</Badge>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={handleSignOut} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex items-center gap-4">
      <DesktopNav />
      <StoreSelector />
      {showMobileMenu && <MobileNav />}
    </div>
  );
}