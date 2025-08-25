import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Package, Tags, Settings, Users, FileText, Menu, LogOut, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanupAuthState } from "@/lib/auth";
import { useEffect, useState } from "react";

interface NavigationProps {
  showMobileMenu?: boolean;
}

export function Navigation({ showMobileMenu = true }: NavigationProps) {
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase.rpc("has_role", { 
          _user_id: session.user.id, 
          _role: "admin" as any 
        });
        setIsAdmin(Boolean(data));
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const { data } = await supabase.rpc("has_role", { 
          _user_id: session.user.id, 
          _role: "admin" as any 
        });
        setIsAdmin(Boolean(data));
      } else {
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
      window.location.href = '/auth';
    }
  };

  const navItems = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/inventory", label: "Inventory", icon: Package },
    { to: "/labels", label: "Label Designer", icon: Tags },
    { to: "/bulk-import", label: "Bulk Import", icon: Upload },
    { to: "/shopify-mapping", label: "Shopify Mapping", icon: FileText },
    { to: "/print-logs", label: "Print Logs", icon: FileText },
  ];

  if (isAdmin) {
    navItems.push({ to: "/admin", label: "Admin", icon: Settings });
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
            {item.label === "Admin" && <Badge variant="secondary" className="ml-1">Admin</Badge>}
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

  // Mobile Navigation
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
                {item.label === "Admin" && <Badge variant="secondary" className="ml-auto">Admin</Badge>}
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
      {showMobileMenu && <MobileNav />}
    </div>
  );
}