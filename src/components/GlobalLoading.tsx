import { useIsFetching } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';

export function GlobalLoading() {
  const isFetching = useIsFetching();
  const [showLoading, setShowLoading] = useState(false);
  
  // Only show loading indicator if fetching persists for more than 500ms
  // and automatically hide after 30 seconds to prevent endless loading
  useEffect(() => {
    if (isFetching > 0) {
      const showTimer = setTimeout(() => setShowLoading(true), 500);
      const hideTimer = setTimeout(() => {
        console.warn('[GlobalLoading] Auto-hiding after 30 seconds');
        setShowLoading(false);
      }, 30000);
      
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    } else {
      setShowLoading(false);
    }
  }, [isFetching]);
  
  if (!showLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <Progress value={undefined} className="h-1 rounded-none" />
    </div>
  );
}