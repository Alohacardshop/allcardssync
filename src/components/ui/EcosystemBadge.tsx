import { cn } from '@/lib/utils';
import { useEcosystemTheme } from '@/hooks/useEcosystemTheme';
import { MapPin } from 'lucide-react';

interface EcosystemBadgeProps {
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'minimal' | 'pill';
}

/**
 * Badge component that displays the current ecosystem (Hawaii or Las Vegas)
 * Uses ecosystem-specific theming for colors
 */
export function EcosystemBadge({ 
  className, 
  showIcon = true, 
  size = 'md',
  variant = 'default' 
}: EcosystemBadgeProps) {
  const { name, shortName, icon, badgeClass } = useEcosystemTheme();

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  if (variant === 'minimal') {
    return (
      <span className={cn('font-medium', badgeClass.split(' ').filter(c => c.startsWith('text-')).join(' '), className)}>
        {icon} {shortName}
      </span>
    );
  }

  if (variant === 'pill') {
    return (
      <div className={cn(
        'inline-flex items-center rounded-full border font-medium',
        badgeClass,
        sizeClasses[size],
        className
      )}>
        <span>{icon}</span>
        <span>{shortName}</span>
      </div>
    );
  }

  return (
    <div className={cn(
      'inline-flex items-center rounded-md border font-medium',
      badgeClass,
      sizeClasses[size],
      className
    )}>
      {showIcon && <MapPin className={iconSizes[size]} />}
      <span>{name}</span>
    </div>
  );
}
