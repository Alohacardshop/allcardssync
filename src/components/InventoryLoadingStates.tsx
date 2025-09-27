import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertCircle, Database, Users, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface InventoryLoadingStatesProps {
  loading: boolean;
  hasAuthError?: boolean;
  hasStoreContext?: boolean;
  hasRoleError?: boolean;
  itemCount?: number;
  onRetry?: () => void;
  onForceRefresh?: () => void;
}

export const InventoryLoadingStates: React.FC<InventoryLoadingStatesProps> = ({
  loading,
  hasAuthError = false,
  hasStoreContext = true,
  hasRoleError = false,
  itemCount = 0,
  onRetry,
  onForceRefresh
}) => {
  // Show authentication error state
  if (hasAuthError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center justify-center p-8 text-center">
          <div>
            <Lock className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-red-900 mb-2">Authentication Error</h3>
            <p className="text-red-700 mb-4">
              Your session has expired or authentication failed. Please sign in again.
            </p>
            <div className="space-x-2">
              <Button variant="outline" onClick={onRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => window.location.href = '/auth'}>
                Sign In Again
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show role/permission error state
  if (hasRoleError) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="flex items-center justify-center p-8 text-center">
          <div>
            <Users className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-orange-900 mb-2">Access Restricted</h3>
            <p className="text-orange-700 mb-4">
              You don't have permission to view inventory. Contact an administrator.
            </p>
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show store context loading/error state
  if (!hasStoreContext) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="flex items-center justify-center p-8 text-center">
          <div>
            <Database className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Loading Store Context</h3>
            <p className="text-blue-700 mb-4">
              Setting up your store and location access...
            </p>
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Initializing...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show general loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8 text-center">
          <div>
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Loading Inventory</h3>
            <p className="text-muted-foreground mb-4">
              Fetching your inventory items...
            </p>
            <Badge variant="secondary" className="text-xs">
              This may take a moment
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show empty state
  if (itemCount === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8 text-center">
          <div>
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Inventory Items</h3>
            <p className="text-muted-foreground mb-4">
              No items found matching your current filters.
            </p>
            <div className="space-x-2">
              <Button variant="outline" onClick={onForceRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
};