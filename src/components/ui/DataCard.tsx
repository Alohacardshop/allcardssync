import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DataCardProps {
  /** Main title of the card */
  title: string;
  /** Subtitle or secondary text */
  subtitle?: string;
  /** Badge to display (status, category, etc.) */
  badge?: ReactNode;
  /** Primary value to display prominently */
  value?: string | number;
  /** Label for the value */
  valueLabel?: string;
  /** Action buttons */
  actions?: ReactNode;
  /** Additional content */
  children?: ReactNode;
  /** Card click handler */
  onClick?: () => void;
  /** Whether card is selected */
  selected?: boolean;
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Standardized data card component for displaying items in grids/lists
 * Provides consistent styling for inventory items, queue items, etc.
 */
export function DataCard({ 
  title, 
  subtitle, 
  badge, 
  value,
  valueLabel,
  actions, 
  children,
  onClick,
  selected = false,
  className,
  size = 'md',
}: DataCardProps) {
  const isClickable = !!onClick;

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-5',
  };

  return (
    <Card 
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        isClickable && 'cursor-pointer hover:shadow-md hover:border-primary/50',
        selected && 'ring-2 ring-primary border-primary',
        className
      )}
      onClick={onClick}
    >
      <div className={sizeClasses[size]}>
        {/* Header row with title and badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className={cn(
              'font-medium text-foreground truncate',
              size === 'sm' ? 'text-sm' : 'text-base'
            )}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {badge && (
            <div className="flex-shrink-0">
              {badge}
            </div>
          )}
        </div>

        {/* Value display */}
        {value !== undefined && (
          <div className="mb-3">
            <p className={cn(
              'font-semibold text-foreground',
              size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-xl' : 'text-lg'
            )}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {valueLabel && (
              <p className="text-xs text-muted-foreground">{valueLabel}</p>
            )}
          </div>
        )}

        {/* Additional content */}
        {children && (
          <div className="mt-3">
            {children}
          </div>
        )}

        {/* Actions */}
        {actions && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}

// Compact variant for list views
export function DataCardCompact({ 
  title, 
  subtitle,
  badge,
  actions,
  onClick,
  className,
}: Pick<DataCardProps, 'title' | 'subtitle' | 'badge' | 'actions' | 'onClick' | 'className'>) {
  return (
    <div 
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border border-border bg-card',
        'transition-colors duration-200',
        onClick && 'cursor-pointer hover:bg-muted/50',
        className
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      {badge && <div className="flex-shrink-0">{badge}</div>}
      {actions && <div className="flex-shrink-0 flex items-center gap-1">{actions}</div>}
    </div>
  );
}
