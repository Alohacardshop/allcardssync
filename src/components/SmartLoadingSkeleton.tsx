import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Lock, 
  Users, 
  Database, 
  Loader2, 
  RefreshCw, 
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { LoadingSnapshot } from '@/lib/loading/LoadingStateManager';

interface SmartLoadingSkeletonProps {
  pageType?: 'dashboard' | 'admin' | 'inventory';
  snapshot: LoadingSnapshot;
  onRetry?: () => void;
  onSignIn?: () => void;
  onApproveRefresh?: () => void;
  onDismissRefresh?: () => void;
}

export function SmartLoadingSkeleton({
  pageType = 'inventory',
  snapshot,
  onRetry,
  onSignIn,
  onApproveRefresh,
  onDismissRefresh
}: SmartLoadingSkeletonProps) {
  const { dominantPhase, phases, message, progress, pausedByActivity, nextRefreshAt } = snapshot;

  // Show refresh banner when new data is available but user is active
  const showRefreshBanner = pausedByActivity && nextRefreshAt && Date.now() >= nextRefreshAt;

  // Progress bar for long operations
  const showProgress = progress !== undefined && progress >= 0 && progress <= 1;

  return (
    <div className="space-y-4">
      {/* Progress bar for long operations */}
      {showProgress && (
        <div className="w-full">
          <Progress value={progress * 100} className="h-1" />
        </div>
      )}

      {/* Refresh banner */}
      {showRefreshBanner && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm text-blue-800 dark:text-blue-200">
                New data available
              </span>
            </div>
            <div className="flex space-x-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={onApproveRefresh}
                className="text-blue-600 border-blue-200 hover:bg-blue-100 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900"
              >
                Update
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onDismissRefresh}
                className="text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900"
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ARIA live region */}
      <div 
        role="status" 
        aria-live="polite" 
        className="sr-only"
      >
        {snapshot.a11yAnnouncement}
      </div>

      {/* Main loading content based on dominant phase */}
      {dominantPhase && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            {dominantPhase === 'auth' && (
              <>
                {phases.auth === 'loading' ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">Checking Authentication</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Verifying your session...
                      </p>
                    </div>
                  </>
                ) : phases.auth === 'error' ? (
                  <>
                    <Lock className="h-8 w-8 text-destructive" />
                    <div>
                      <h3 className="font-medium text-destructive">Session Expired</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your session has expired. Please sign in again.
                      </p>
                    </div>
                    <Button onClick={onSignIn} className="mt-4">
                      Sign In Again
                    </Button>
                  </>
                ) : null}
              </>
            )}

            {dominantPhase === 'store' && (
              <>
                {phases.store === 'loading' ? (
                  <>
                    <Users className="h-8 w-8 animate-pulse text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">Loading Store Context</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Initializing store settings and permissions...
                      </p>
                    </div>
                  </>
                ) : phases.store === 'error' ? (
                  <>
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <div>
                      <h3 className="font-medium text-destructive">Access Restricted</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Unable to load store context. Check your permissions.
                      </p>
                    </div>
                    <Button onClick={onRetry} variant="outline" className="mt-4">
                      Check Again
                    </Button>
                  </>
                ) : null}
              </>
            )}

            {dominantPhase === 'data' && (
              <>
                {phases.data === 'loading' ? (
                  <>
                    <Database className="h-8 w-8 animate-pulse text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">Loading {pageType === 'inventory' ? 'Inventory' : 'Data'}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {message || `Fetching ${pageType} data...`}
                      </p>
                    </div>
                  </>
                ) : phases.data === 'error' ? (
                  <>
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <div>
                      <h3 className="font-medium text-destructive">Failed to Load Data</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {message || "There was an error loading the data."}
                      </p>
                    </div>
                    <Button onClick={onRetry} className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  </>
                ) : phases.data === 'empty' ? (
                  <>
                    <Database className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">No Items Found</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        No items match your current filters.
                      </p>
                    </div>
                    <Button onClick={onRetry} variant="outline" className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </>
                ) : phases.data === 'degraded' ? (
                  <>
                    <Clock className="h-8 w-8 text-yellow-600" />
                    <div>
                      <Badge variant="secondary" className="mb-2">
                        Cached Data
                      </Badge>
                      <h3 className="font-medium">You're seeing cached data</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        We're having trouble connecting. Showing your last known data.
                      </p>
                    </div>
                    <Button onClick={onRetry} variant="outline" className="mt-4">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </>
                ) : null}
              </>
            )}

            {dominantPhase === 'ui' && (
              <>
                {phases.ui === 'loading' ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">Processing</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {message || "Processing your request..."}
                      </p>
                    </div>
                  </>
                ) : phases.ui === 'error' ? (
                  <>
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <div>
                      <h3 className="font-medium text-destructive">Operation Failed</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {message || "The operation could not be completed."}
                      </p>
                    </div>
                    <Button onClick={onRetry} className="mt-4">
                      Try Again
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Skeleton content when no dominant phase (normal loading) */}
      {!dominantPhase && (phases.data === 'loading' || phases.store === 'loading') && (
        <div className="space-y-4">
          {Array.from({ length: pageType === 'inventory' ? 5 : 3 }).map((_, index) => (
            <Card key={index}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <Skeleton className="h-6 w-6" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                    </div>
                  </div>
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardHeader>
              
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center space-x-1">
                      <Skeleton className="h-3 w-3" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-16" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Preset components for different page types
export function InventorySkeleton(props: Omit<SmartLoadingSkeletonProps, 'pageType'>) {
  return <SmartLoadingSkeleton pageType="inventory" {...props} />;
}

export function DashboardSkeleton(props: Omit<SmartLoadingSkeletonProps, 'pageType'>) {
  return <SmartLoadingSkeleton pageType="dashboard" {...props} />;
}

export function AdminSkeleton(props: Omit<SmartLoadingSkeletonProps, 'pageType'>) {
  return <SmartLoadingSkeleton pageType="admin" {...props} />;
}