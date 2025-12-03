import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { canUseApp, getUserRole, getRegionDisplayName, type AppKey } from '@/lib/permissions';
import { getLocationByStoreKey } from '@/config/locations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Package, 
  Barcode, 
  FileText, 
  Settings, 
  ShoppingCart,
  MapPin,
  Store
} from 'lucide-react';

interface AppTile {
  key: AppKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}

const APP_TILES: AppTile[] = [
  {
    key: 'intake',
    title: 'Intake',
    description: 'Process new inventory items and manage batches',
    icon: ShoppingCart,
    href: '/intake',
    color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  {
    key: 'inventory',
    title: 'Inventory',
    description: 'View and manage your store inventory',
    icon: Package,
    href: '/inventory',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  {
    key: 'barcode',
    title: 'Barcode Printing',
    description: 'Print labels and manage barcode templates',
    icon: Barcode,
    href: '/barcode-printing',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  },
  {
    key: 'docs',
    title: 'Documents',
    description: 'Handbooks, procedures, and policies',
    icon: FileText,
    href: '/docs',
    color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  {
    key: 'ebay',
    title: 'eBay',
    description: 'Manage eBay listings, sync queue, and settings',
    icon: Store,
    href: '/ebay',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  },
  {
    key: 'admin',
    title: 'Admin',
    description: 'System administration and settings',
    icon: Settings,
    href: '/admin',
    color: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
];

export default function DashboardHome() {
  const { user, isAdmin, isStaff } = useAuth();
  const { assignedStore, assignedRegion } = useStore();

  const role = getUserRole(isAdmin, isStaff);
  const location = getLocationByStoreKey(assignedStore);
  const regionName = getRegionDisplayName(assignedRegion || location?.regionId);

  // Filter tiles based on user permissions
  const visibleTiles = APP_TILES.filter(tile => canUseApp(role, tile.key));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Aloha Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Welcome back, {user?.email?.split('@')[0] || 'User'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="font-medium">{regionName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* App Tiles */}
      <div className="container mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold text-foreground mb-6">Applications</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleTiles.map((tile) => (
            <Link key={tile.key} to={tile.href}>
              <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${tile.color} mb-3 group-hover:scale-110 transition-transform`}>
                    <tile.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{tile.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{tile.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {visibleTiles.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No applications available for your role.</p>
          </div>
        )}
      </div>
    </div>
  );
}
