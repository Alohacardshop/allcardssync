import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Home, 
  PackagePlus, 
  Package, 
  Archive,
  Printer, 
  FileText, 
  ShoppingBag, 
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PATHS } from '@/routes/paths';

interface SidebarProps {
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  PackagePlus,
  Package,
  Archive,
  Printer,
  FileText,
  ShoppingBag,
  Settings,
};

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', href: PATHS.dashboard, icon: 'Home' },
  { key: 'intake', label: 'Intake', href: PATHS.intake, icon: 'PackagePlus' },
  { key: 'inventory', label: 'Inventory', href: PATHS.inventory, icon: 'Package' },
  { key: 'batches', label: 'Batches', href: PATHS.batches, icon: 'Archive' },
  { key: 'barcode', label: 'Print', href: PATHS.barcodePrinting, icon: 'Printer' },
  { key: 'docs', label: 'Documents', href: PATHS.docs, icon: 'FileText' },
];

const ADMIN_ITEMS: NavItem[] = [
  { key: 'ebay', label: 'eBay', href: PATHS.ebay, icon: 'ShoppingBag', adminOnly: true },
  { key: 'admin', label: 'Admin', href: PATHS.admin, icon: 'Settings', adminOnly: true },
];

/**
 * Sidebar navigation component for desktop/tablet
 * Collapsible between icon-only and full modes
 */
export function Sidebar({ className }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isAdmin } = useAuth();
  const { bgClass, accentClass } = useEcosystemTheme();

  const isActive = (href: string) => {
    if (href === PATHS.dashboard) return location.pathname === PATHS.dashboard;
    return location.pathname.startsWith(href);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = ICON_MAP[item.icon] || Home;
    const active = isActive(item.href);

    const navButton = (
      <Link
        to={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg',
          'transition-colors duration-200',
          active
            ? cn('bg-primary text-primary-foreground')
            : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          collapsed && 'justify-center px-2'
        )}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary-foreground')} />
        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.key} delayDuration={0}>
          <TooltipTrigger asChild>
            {navButton}
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.key}>{navButton}</div>;
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-14 md:top-16 bottom-0',
        'bg-sidebar border-r border-sidebar-border',
        'flex flex-col',
        'transition-all duration-300 ease-in-out',
        'z-40',
        collapsed ? 'w-16' : 'w-60',
        // Hide on small screens (will use bottom nav instead)
        'hidden md:flex',
        className
      )}
    >
      {/* Ecosystem indicator */}
      <div className={cn(
        'px-3 py-3 mx-2 mt-3 rounded-lg',
        bgClass,
        collapsed && 'px-2 mx-1'
      )}>
        {!collapsed ? (
          <p className={cn('text-xs font-medium', accentClass)}>
            Store Ecosystem
          </p>
        ) : (
          <div className={cn('text-center text-lg')}>
            {/* Icon only when collapsed */}
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(renderNavItem)}
        
        {/* Admin section */}
        {isAdmin && (
          <>
            <div className={cn(
              'pt-4 mt-4 border-t border-sidebar-border',
              collapsed && 'pt-2 mt-2'
            )}>
              {!collapsed && (
                <p className="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Admin
                </p>
              )}
              {ADMIN_ITEMS.map(renderNavItem)}
            </div>
          </>
        )}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full justify-center',
            !collapsed && 'justify-start'
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
