import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Clock, 
  RefreshCw,
  Zap,
  AlertCircle,
  Database,
  CheckCircle
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/api';
import type { CatalogStats, QueueStats, SyncError, GameMode } from '@/lib/api';

interface RebuildProgressWidgetProps {
  mode: GameMode;
  stats: CatalogStats | null;
  queueStats: QueueStats | null;
  errors: SyncError[];
  isActiveSync: boolean;
  onQueuePending: () => void;
  onProcessNext: () => void;
  onRefresh: () => void;
  queueing: boolean;
  processing: boolean;
  refreshing: boolean;
}

export function RebuildProgressWidget({
  mode,
  stats,
  queueStats,
  errors,
  isActiveSync,
  onQueuePending,
  onProcessNext,
  onRefresh,
  queueing,
  processing,
  refreshing
}: RebuildProgressWidgetProps) {
  const totalItems = queueStats ? queueStats.queued + queueStats.processing + queueStats.done + queueStats.error : 0;
  const completedItems = queueStats ? queueStats.done + queueStats.error : 0;
  const progressPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

  const getStatusColor = () => {
    if (!queueStats) return 'secondary';
    if (queueStats.error > 0) return 'destructive';
    if (queueStats.processing > 0 || isActiveSync) return 'default';
    if (queueStats.done > 0) return 'secondary';
    return 'outline';
  };

  const getStatusText = () => {
    if (!queueStats) return 'Loading...';
    if (queueStats.processing > 0) return 'Processing';
    if (queueStats.queued > 0) return 'Queued';
    if (queueStats.error > 0) return 'Has Errors';
    if (queueStats.done > 0) return 'Complete';
    return 'Idle';
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <CardTitle className="text-base">Rebuild Progress</CardTitle>
            <Badge variant={getStatusColor()} className="text-xs">
              {getStatusText()}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Catalog Stats */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Sets</span>
            </div>
            <div className="font-semibold">{stats?.sets_count?.toLocaleString() || '---'}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Database className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Cards</span>
            </div>
            <div className="font-semibold">{stats?.cards_count?.toLocaleString() || '---'}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Pending</span>
            </div>
            <div className="font-semibold text-orange-600">{stats?.pending_count?.toLocaleString() || '---'}</div>
          </div>
        </div>

        {/* Queue Progress */}
        {queueStats && totalItems > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Queue Progress</span>
              <span>{completedItems}/{totalItems} ({Math.round(progressPercentage)}%)</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-blue-600 font-medium">{queueStats.queued}</div>
                <div className="text-muted-foreground">Queued</div>
              </div>
              <div className="text-center">
                <div className="text-orange-600 font-medium">{queueStats.processing}</div>
                <div className="text-muted-foreground">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-green-600 font-medium">{queueStats.done}</div>
                <div className="text-muted-foreground">Done</div>
              </div>
              <div className="text-center">
                <div className="text-red-600 font-medium">{queueStats.error}</div>
                <div className="text-muted-foreground">Errors</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Errors */}
        {errors.length > 0 && (
          <div className="space-y-2 p-2 bg-destructive/5 rounded-lg border border-destructive/10">
            <div className="flex items-center gap-1 text-xs font-medium text-destructive">
              <AlertCircle className="h-3 w-3" />
              Recent Errors ({errors.length})
            </div>
            <div className="space-y-1 max-h-16 overflow-y-auto">
              {errors.slice(0, 2).map((error, idx) => (
                <div key={idx} className="text-xs text-muted-foreground truncate">
                  <span className="font-mono text-destructive">{error.set_id}</span>: {error.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onQueuePending}
            disabled={queueing || !stats?.pending_count}
            className="flex-1 text-xs h-7"
          >
            {queueing ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                Queueing...
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 mr-1" />
                Queue Pending ({stats?.pending_count || 0})
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onProcessNext}
            disabled={processing || !queueStats?.queued}
            className="flex-1 text-xs h-7"
          >
            {processing ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-3 w-3 mr-1" />
                Process Next
              </>
            )}
          </Button>
        </div>

        {/* Status Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            {isActiveSync ? (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>Active sync</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3" />
                <span>Idle</span>
              </>
            )}
          </div>
          <div>
            Updated {formatTimeAgo(new Date().toISOString())}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}