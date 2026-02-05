import { Loader2, Palmtree } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FullScreenLoaderProps {
  /** Main title text */
  title?: string;
  /** Optional subtitle for additional context */
  subtitle?: string;
  /** Additional className for the container */
  className?: string;
}

/**
 * Branded full-screen loader component
 * Use for auth guards, page transitions, and initial app loading
 */
export function FullScreenLoader({ 
  title = 'Loading…', 
  subtitle,
  className
}: FullScreenLoaderProps) {
  return (
    <div className={cn(
      'min-h-screen flex flex-col items-center justify-center bg-background',
      className
    )}>
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[hsl(var(--ecosystem-hawaii)/0.08)] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[hsl(var(--ecosystem-vegas)/0.08)] rounded-full blur-3xl" />
      </div>

      {/* Loader content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Brand icon with spinner */}
        <div className="relative">
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
            <Palmtree className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-background border border-border">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          </div>
        </div>

        {/* Text content */}
        <div className="text-center space-y-1.5">
          <p className="text-lg font-medium text-foreground">{title}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
