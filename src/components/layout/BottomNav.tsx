import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { Menu, Home } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EcosystemBadge } from '@/components/ui/EcosystemBadge';
import { PATHS } from '@/routes/paths';
import { BOTTOM_NAV_PRIMARY, BOTTOM_NAV_MORE, type AppNavItem } from '@/config/navigation';

interface BottomNavProps {
  className?: string;
}

/**
 * Mobile bottom navigation bar
 * Fixed at bottom of screen with 4 main actions + "More" menu
 */
export function BottomNav({ className }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { accentClass } = useEcosystemTheme();

  const isActive = (href: string) => {
    if (href === PATHS.dashboard) return location.pathname === PATHS.dashboard;
    return location.pathname.startsWith(href);
  };

  const renderNavItem = (item: AppNavItem) => {
    const Icon = item.icon || Home;
    const active = isActive(item.href);

    return (
      <Link
        key={item.key}
        to={item.href}
        className={cn(
          'flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-[56px]',
          'transition-colors duration-200',
          active
            ? cn('text-primary', accentClass)
            : 'text-muted-foreground'
        )}
      >
        <Icon className={cn(
          'h-5 w-5',
          active && 'text-primary'
        )} />
        <span className={cn(
          'text-[10px] font-medium',
          active ? 'text-primary' : 'text-muted-foreground'
        )}>
          {item.label}
        </span>
      </Link>
    );
  };

  // Filter more items based on admin status
  const visibleMoreItems = BOTTOM_NAV_MORE.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0',
        'bg-background/95 backdrop-blur-sm',
        'border-t border-border',
        'flex items-center justify-around',
        'h-16 px-2',
        'safe-area-inset-bottom',
        'z-50',
        // Only show on mobile
        'md:hidden',
        className
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {BOTTOM_NAV_PRIMARY.map(renderNavItem)}
      
      {/* More Menu */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <button
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-[56px]',
              'transition-colors duration-200',
              'text-muted-foreground'
            )}
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-2xl">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>More Options</SheetTitle>
              <EcosystemBadge size="sm" />
            </div>
          </SheetHeader>
          
          <div className="grid gap-2 pb-4">
            {visibleMoreItems.map((item) => {
              const Icon = item.icon || Home;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg',
                    'transition-colors duration-200',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
