import React from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger, 
  TooltipProvider 
} from '@/components/ui/tooltip';
import { Cloud, Database, Info } from 'lucide-react';
import type { InventoryTruthMode } from '@/hooks/useInventoryTruthMode';

interface TruthModeBadgeProps {
  mode: InventoryTruthMode;
  className?: string;
  showLabel?: boolean;
}

const MODE_CONFIG = {
  shopify: {
    label: 'Shopify Truth',
    shortLabel: 'Shopify',
    icon: Cloud,
    variant: 'default' as const,
    className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20',
    description: 'Shopify is the source of truth for inventory quantities.',
    details: [
      'Quantities sync automatically from Shopify POS & online sales',
      'Manual quantity edits are disabled',
      'Use Receiving or Transfer workflows to adjust stock',
      'Webhooks update local quantities in real-time',
    ],
  },
  database: {
    label: 'Database Truth',
    shortLabel: 'Database',
    icon: Database,
    variant: 'secondary' as const,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20',
    description: 'Local database is the source of truth for inventory quantities.',
    details: [
      'Manual quantity edits are allowed',
      'Changes sync to Shopify after local save',
      'Shopify discrepancies trigger drift alerts only',
      'Best for inventory managed primarily in this system',
    ],
  },
};

export function TruthModeBadge({ mode, className, showLabel = true }: TruthModeBadgeProps) {
  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`${config.className} cursor-help ${className || ''}`}
          >
            <Icon className="h-3 w-3 mr-1" />
            {showLabel && <span>{config.shortLabel}</span>}
            <Info className="h-3 w-3 ml-1 opacity-60" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          align="start"
          className="max-w-xs p-3"
        >
          <div className="space-y-2">
            <div className="font-semibold text-sm">{config.label}</div>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            <ul className="text-xs space-y-1 mt-2">
              {config.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
