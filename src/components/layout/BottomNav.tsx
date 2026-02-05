import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { 
  Home, 
  PackagePlus, 
  Package, 
  Printer, 
  Menu,
  FileText,
  ShoppingBag,
  Settings,
  Archive,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { EcosystemBadge } from '@/components/ui/EcosystemBadge';
import { PATHS } from '@/routes/paths';

interface BottomNavProps {
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  PackagePlus,
  Package,
  Printer,
  Menu,
  FileText,
  ShoppingBag,
  Settings,
  Archive,
};

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
}

const BOTTOM_NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', href: PATHS.dashboard, icon: 'Home' },
  { key: 'intake', label: 'Intake', href: PATHS.intake, icon: 'PackagePlus' },
  { key: 'inventory', label: 'Inventory', href: PATHS.inventory, icon: 'Package' },
  { key: 'barcode', label: 'Print', href: PATHS.barcodePrinting, icon: 'Printer' },
];

const MORE_ITEMS: NavItem[] = [
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: 'Archive' },
  { key: 'docs', label: 'Documents', href: PATHS.docs, icon: 'FileText' },
  { key: 'ebay', label: 'eBay', href: PATHS.ebay, icon: 'ShoppingBag' },
  { key: 'admin', label: 'Settings', href: PATHS.admin, icon: 'Settings' },
];

/**
 * Mobile bottom navigation bar
 * Fixed at bottom of screen with 5 main actions
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

  const renderNavItem = (item: NavItem) => {
    const Icon = ICON_MAP[item.icon] || Home;
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
      {BOTTOM_NAV_ITEMS.map(renderNavItem)}
      
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
            {MORE_ITEMS.filter(item => {
              // Hide admin items for non-admins
              if (item.key === 'ebay' && !isAdmin) return false;
              if (item.key === 'admin' && !isAdmin) return false;
              return true;
            }).map((item) => {
              const Icon = ICON_MAP[item.icon] || Home;
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
