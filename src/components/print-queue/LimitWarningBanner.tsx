import { AlertTriangle, Filter } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface LimitWarningBannerProps {
  displayedCount: number;
  totalCount: number;
  limit?: number;
}

export function LimitWarningBanner({ 
  displayedCount, 
  totalCount, 
  limit = 5000 
}: LimitWarningBannerProps) {
  if (totalCount <= limit) return null;

  return (
    <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Results Limited</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          Showing {displayedCount.toLocaleString()} of {totalCount.toLocaleString()} items. 
          Use filters to narrow your results.
        </span>
        <Filter className="h-4 w-4 opacity-50" />
      </AlertDescription>
    </Alert>
  );
}
