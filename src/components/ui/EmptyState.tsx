import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, Package, Search, FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  /** Icon to display */
  icon?: LucideIcon;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Action button or content */
  action?: ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Custom className */
  className?: string;
}

/**
 * Consistent empty state component for when no data is available
 * Use in lists, tables, and search results
 */
export function EmptyState({ 
  icon: Icon = Package, 
  title, 
  description, 
  action,
  size = 'md',
  className 
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: 'py-8',
      icon: 'h-10 w-10',
      title: 'text-base',
      description: 'text-sm',
    },
    md: {
      container: 'py-12',
      icon: 'h-12 w-12',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-16',
      icon: 'h-16 w-16',
      title: 'text-xl',
      description: 'text-base',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center',
      sizes.container,
      className
    )}>
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className={cn('text-muted-foreground', sizes.icon)} />
      </div>
      
      <h3 className={cn('font-medium text-foreground mb-1', sizes.title)}>
        {title}
      </h3>
      
      {description && (
        <p className={cn('text-muted-foreground max-w-sm mb-4', sizes.description)}>
          {description}
        </p>
      )}
      
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}

// Preset empty states for common scenarios
export function NoResultsState({ 
  searchQuery, 
  onClear 
}: { 
  searchQuery?: string; 
  onClear?: () => void;
}) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={searchQuery 
        ? `No items match "${searchQuery}". Try adjusting your search or filters.`
        : 'Try adjusting your search or filters.'
      }
      action={onClear && (
        <button 
          onClick={onClear}
          className="text-primary hover:underline text-sm font-medium"
        >
          Clear filters
        </button>
      )}
    />
  );
}

export function NoDataState({ 
  itemName = 'items',
  action 
}: { 
  itemName?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={Package}
      title={`No ${itemName} yet`}
      description={`Get started by adding your first ${itemName.replace(/s$/, '')}.`}
      action={action}
    />
  );
}

export function ErrorState({ 
  title = 'Something went wrong',
  description,
  action 
}: { 
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={FileQuestion}
      title={title}
      description={description || 'An error occurred while loading the data. Please try again.'}
      action={action}
    />
  );
}
