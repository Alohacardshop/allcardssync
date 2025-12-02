import { Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useStore } from '@/contexts/StoreContext';
import { getUserRole, getRegionDisplayName } from '@/lib/permissions';
import { getLocationByStoreKey } from '@/config/locations';
import { Badge } from '@/components/ui/badge';
import { User, MapPin, Shield } from 'lucide-react';

/**
 * Dashboard layout wrapper that shows user info badge
 * Used for all authenticated dashboard routes
 */
export function DashboardLayout() {
  const { user, isAdmin, isStaff } = useAuth();
  const { assignedStore, assignedRegion } = useStore();

  const role = getUserRole(isAdmin, isStaff);
  const location = getLocationByStoreKey(assignedStore);
  const regionName = getRegionDisplayName(assignedRegion || location?.regionId);

  return (
    <div className="min-h-screen bg-background">
      {/* User Info Badge - Fixed position in top right */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-sm flex items-center gap-3">
          {/* User Email */}
          <div className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-foreground font-medium truncate max-w-[150px]">
              {user?.email?.split('@')[0] || 'User'}
            </span>
          </div>

          {/* Role Badge */}
          {role && (
            <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </Badge>
          )}

          {/* Location Badge */}
          <Badge variant="outline" className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {regionName}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <Outlet />
    </div>
  );
}
