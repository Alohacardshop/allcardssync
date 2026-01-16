import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { canUseApp, getUserRole, type AppKey } from '@/lib/permissions';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Barcode, 
  FileText, 
  Settings, 
  ShoppingCart,
  Store,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
} from 'lucide-react';

interface AppTile {
  key: AppKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  gradient: string;
  iconBg: string;
}

const APP_TILES: AppTile[] = [
  {
    key: 'intake',
    title: 'Intake',
    description: 'Process new inventory',
    icon: ShoppingCart,
    href: '/intake',
    gradient: 'from-emerald-500/10 to-emerald-500/5',
    iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'inventory',
    title: 'Inventory',
    description: 'View and manage items',
    icon: Package,
    href: '/inventory',
    gradient: 'from-blue-500/10 to-blue-500/5',
    iconBg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
  {
    key: 'barcode',
    title: 'Print Labels',
    description: 'Print barcodes & labels',
    icon: Barcode,
    href: '/barcode-printing',
    gradient: 'from-purple-500/10 to-purple-500/5',
    iconBg: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  },
  {
    key: 'docs',
    title: 'Documents',
    description: 'Guides & procedures',
    icon: FileText,
    href: '/docs',
    gradient: 'from-amber-500/10 to-amber-500/5',
    iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  {
    key: 'ebay',
    title: 'eBay',
    description: 'Manage listings',
    icon: Store,
    href: '/ebay',
    gradient: 'from-orange-500/10 to-orange-500/5',
    iconBg: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  {
    key: 'admin',
    title: 'Admin',
    description: 'System settings',
    icon: Settings,
    href: '/admin',
    gradient: 'from-slate-500/10 to-slate-500/5',
    iconBg: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  },
];

// Quick stat card component
function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend 
}: { 
  label: string; 
  value: string | number; 
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; label: string };
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-success" />
                <span className="text-success font-medium">+{trend.value}%</span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardHome() {
  const { user, isAdmin, isStaff } = useAuth();
  const { assignedStore } = useStore();
  const { name: ecosystemName, icon: ecosystemIcon, bgClass, accentClass } = useEcosystemTheme();

  const role = getUserRole(isAdmin, isStaff);
  const userName = user?.email?.split('@')[0] || 'User';

  // Filter tiles based on user permissions
  const visibleTiles = APP_TILES.filter(tile => canUseApp(role, tile.key));

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Welcome Header */}
      <div className={`rounded-xl p-4 md:p-6 ${bgClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{ecosystemIcon}</span>
              <Badge variant="outline" className={accentClass}>
                {ecosystemName} Store
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
              Welcome back, {userName}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening in your store today.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard 
          label="Active Lots" 
          value="3" 
          icon={Package}
        />
        <StatCard 
          label="Queue Items" 
          value="12" 
          icon={Clock}
        />
        <StatCard 
          label="Synced Today" 
          value="47" 
          icon={CheckCircle2}
        />
        <StatCard 
          label="Total Items" 
          value="2,340" 
          icon={TrendingUp}
        />
      </div>

      {/* App Tiles */}
      <div>
        <h2 className="text-lg font-medium text-foreground mb-4">Applications</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 md:gap-4">
          {visibleTiles.map((tile) => (
            <Link key={tile.key} to={tile.href} className="group">
              <Card className={`
                h-full border-0 bg-gradient-to-br ${tile.gradient}
                hover:shadow-lg hover:scale-[1.02] 
                transition-all duration-200 cursor-pointer
                ring-1 ring-border/50 hover:ring-primary/30
              `}>
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center mb-3
                    ${tile.iconBg}
                    group-hover:scale-110 transition-transform duration-200
                  `}>
                    <tile.icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-medium text-foreground text-sm mb-0.5">
                    {tile.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {tile.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {visibleTiles.length === 0 && (
          <div className="text-center py-12 bg-muted/30 rounded-lg">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No applications available for your role.</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="group hover:border-primary/50 transition-colors">
          <Link to="/intake" className="block">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <ShoppingCart className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Start New Intake</p>
                  <p className="text-sm text-muted-foreground">Process cards or comics</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Link>
        </Card>

        <Card className="group hover:border-primary/50 transition-colors">
          <Link to="/inventory" className="block">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium text-foreground">View Inventory</p>
                  <p className="text-sm text-muted-foreground">Search and manage items</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
