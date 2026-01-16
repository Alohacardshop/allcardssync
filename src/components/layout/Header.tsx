import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { EcosystemBadge } from '@/components/ui/EcosystemBadge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, Settings, User, Sun, Moon, Monitor } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/components/ui/theme-provider';

interface HeaderProps {
  className?: string;
}

/**
 * Minimal header component with ecosystem branding and user menu
 * Fixed position at top of the page
 */
export function Header({ className }: HeaderProps) {
  const { user } = useAuth();
  const { selectedLocation, availableLocations } = useStore();
  const { name: ecosystemName, icon } = useEcosystemTheme();
  const { setTheme, theme } = useTheme();

  // Find the location name from available locations
  const currentLocationName = availableLocations.find(
    loc => loc.gid === selectedLocation
  )?.name;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const userInitials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'U';

  const userName = user?.email?.split('@')[0] || 'User';

  return (
    <header className={cn(
      'fixed top-0 left-0 right-0 z-50',
      'h-14 md:h-16',
      'bg-background/95 backdrop-blur-sm',
      'border-b border-border',
      'flex items-center justify-between',
      'px-4 md:px-6',
      className
    )}>
      {/* Left: Logo + Ecosystem */}
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">AC</span>
          </div>
          <span className="font-semibold text-foreground hidden sm:inline">
            AllCards
          </span>
        </Link>
        
        {/* Ecosystem Badge */}
        <EcosystemBadge size="sm" variant="pill" className="hidden xs:flex" />
      </div>

      {/* Center: Location (on larger screens) */}
      {currentLocationName && (
        <div className="hidden md:flex items-center text-sm text-muted-foreground">
          <span className="truncate max-w-[200px]">
            {currentLocationName}
          </span>
        </div>
      )}

      {/* Right: User Menu */}
      <div className="flex items-center gap-2">
        {/* Mobile ecosystem indicator */}
        <span className="text-lg md:hidden">{icon}</span>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{userName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {/* Ecosystem indicator in menu */}
            <DropdownMenuItem disabled className="opacity-100">
              <EcosystemBadge size="sm" />
            </DropdownMenuItem>
            
            {currentLocationName && (
              <DropdownMenuItem disabled className="opacity-70 text-xs">
                📍 {currentLocationName}
              </DropdownMenuItem>
            )}
            
            <DropdownMenuSeparator />
            
            {/* Theme Switcher */}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Theme</DropdownMenuLabel>
            <div className="flex gap-1 px-2 py-1">
              <Button
                variant={theme === 'light' ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 h-8"
                onClick={() => setTheme('light')}
              >
                <Sun className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={theme === 'dark' ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 h-8"
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={theme === 'system' ? 'secondary' : 'ghost'}
                size="sm"
                className="flex-1 h-8"
                onClick={() => setTheme('system')}
              >
                <Monitor className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem asChild>
              <Link to="/admin" className="flex items-center cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
