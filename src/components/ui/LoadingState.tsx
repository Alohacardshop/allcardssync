import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  /** Optional loading message */
  message?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className */
  className?: string;
  /** Whether to center in viewport (for full-page loading) */
  fullPage?: boolean;
}

/**
 * Consistent loading state component
 * Use throughout the app for unified loading experience
 */
export function LoadingState({ 
  message = 'Loading...', 
  size = 'md',
  className,
  fullPage = false
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-3',
      fullPage && 'min-h-screen',
      !fullPage && 'py-12',
      className
    )}>
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
      {message && (
        <p className={cn('text-muted-foreground', textSizeClasses[size])}>
          {message}
        </p>
      )}
    </div>
  );
}
