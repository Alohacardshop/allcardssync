import { useIsFetching } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';

export function GlobalLoading() {
  const isFetching = useIsFetching();
  
  if (isFetching === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <Progress value={undefined} className="h-1 rounded-none" />
    </div>
  );
}