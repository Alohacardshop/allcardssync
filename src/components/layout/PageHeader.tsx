import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EcosystemBadge } from '@/components/ui/EcosystemBadge';

interface PageHeaderProps {
  /** Page title */
  title: string;
  /** Optional description below title */
  description?: string;
  /** Show ecosystem badge next to title */
  showEcosystem?: boolean;
  /** Action buttons to display on the right */
  actions?: ReactNode;
  /** Additional content below title/description */
  children?: ReactNode;
  /** Custom className */
  className?: string;
}

/**
 * Consistent page header component with title, description, and actions
 * Use at the top of every page for consistent styling
 */
export function PageHeader({ 
  title, 
  description, 
  showEcosystem = false,
  actions, 
  children,
  className 
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6 md:mb-8', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {showEcosystem && (
              <EcosystemBadge size="sm" variant="pill" className="hidden sm:flex" />
            )}
          </div>
          {description && (
            <p className="text-muted-foreground text-sm md:text-base max-w-2xl">
              {description}
            </p>
          )}
          {/* Mobile ecosystem badge */}
          {showEcosystem && (
            <EcosystemBadge size="sm" variant="pill" className="sm:hidden mt-2" />
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}
