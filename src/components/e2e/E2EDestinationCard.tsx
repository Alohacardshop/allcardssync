/**
 * Individual marketplace destination card (Shopify, eBay, Print)
 */

import { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatItem {
  label: string;
  count: number;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

interface E2EDestinationCardProps {
  title: string;
  icon: ReactNode;
  dryRun: boolean;
  onDryRunChange?: (value: boolean) => void;
  dryRunReadOnly?: boolean;
  stats: StatItem[];
  actions: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: 'default' | 'secondary' | 'outline';
    icon?: ReactNode;
  }[];
  footer?: ReactNode;
  isLive?: boolean;
}

export function E2EDestinationCard({
  title,
  icon,
  dryRun,
  onDryRunChange,
  dryRunReadOnly,
  stats,
  actions,
  footer,
  isLive
}: E2EDestinationCardProps) {
  const statVariants = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-destructive/10 text-destructive'
  };

  return (
    <Card className={cn(
      'transition-colors',
      !dryRun && 'border-destructive/50'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {!dryRun && (
              <Badge variant="destructive" className="text-xs">LIVE</Badge>
            )}
            {dryRunReadOnly ? (
              <Badge variant={dryRun ? 'secondary' : 'destructive'} className="text-xs">
                {dryRun ? 'Dry Run' : 'Live'}
              </Badge>
            ) : (
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${title}-dry-run`} className="text-xs text-muted-foreground">
                  Dry
                </Label>
                <Switch
                  id={`${title}-dry-run`}
                  checked={dryRun}
                  onCheckedChange={onDryRunChange}
                  className="scale-75 origin-right"
                />
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* Stats */}
        {stats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {stats.map((stat, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md',
                  statVariants[stat.variant || 'default']
                )}
              >
                <span className="font-medium">{stat.count}</span>
                <span>{stat.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              size="sm"
              variant={action.variant || 'default'}
              onClick={action.onClick}
              disabled={action.disabled}
              className="h-8"
            >
              {action.loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : action.icon ? (
                <span className="mr-1.5">{action.icon}</span>
              ) : null}
              {action.label}
            </Button>
          ))}
        </div>

        {/* Footer */}
        {footer}
      </CardContent>
    </Card>
  );
}
