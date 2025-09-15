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
  
  // No store switching needed - users are assigned to single store
  const { assignedStore, assignedStoreName } = useStore();

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

  // Simple store display component - no switching needed
  const StoreDisplay = () => {
    if (!assignedStore) {
      return null;
    }

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

    return (
      <div className="flex items-center gap-2 px-2 py-1 bg-muted/30 rounded-md">
        {getStoreIcon(assignedStore)}
        <span className="text-sm font-medium text-muted-foreground">
          {assignedStoreName || assignedStore}
        </span>
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
    { to: "/test-hardware", label: "Hardware Test", icon: Settings },
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
      <StoreDisplay />
      {showMobileMenu && <MobileNav />}
    </div>
  );
}