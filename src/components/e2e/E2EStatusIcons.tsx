/**
 * Status icons for E2E test items showing sync state for each platform
 */

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, X, Clock, Loader2 } from 'lucide-react';
import type { TestItemStatus } from '@/hooks/useE2ETest';

interface StatusIconProps {
  platform: 'S' | 'E' | 'P';
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
}

function StatusIcon({ platform, status, error }: StatusIconProps) {
  const baseClasses = 'inline-flex items-center gap-0.5 text-xs font-medium rounded px-1 py-0.5';
  
  const config = {
    pending: { 
      icon: null, 
      classes: 'bg-muted text-muted-foreground',
      label: 'Not started'
    },
    syncing: { 
      icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />, 
      classes: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      label: 'Syncing...'
    },
    synced: { 
      icon: <Check className="h-2.5 w-2.5" />, 
      classes: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      label: 'Synced'
    },
    failed: { 
      icon: <X className="h-2.5 w-2.5" />, 
      classes: 'bg-destructive/10 text-destructive',
      label: error || 'Failed'
    }
  };

  const { icon, classes, label } = config[status];

  const content = (
    <span className={cn(baseClasses, classes)}>
      {icon}
      {platform}
    </span>
  );

  if (status === 'failed' && error) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-[250px]">
          <p className="text-xs">{error}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface E2EStatusIconsProps {
  itemStatus: TestItemStatus;
  shopifyError?: string;
  ebayError?: string;
  printedAt?: string;
}

export function E2EStatusIcons({ itemStatus, shopifyError, ebayError, printedAt }: E2EStatusIconsProps) {
  // Derive platform-specific statuses from the item status
  const getShopifyStatus = (): StatusIconProps['status'] => {
    if (itemStatus === 'shopify_syncing') return 'syncing';
    if (itemStatus === 'shopify_synced' || 
        itemStatus === 'ebay_queued' || 
        itemStatus === 'ebay_processing' || 
        itemStatus === 'ebay_synced' || 
        itemStatus === 'printed') return 'synced';
    if (itemStatus === 'shopify_failed') return 'failed';
    return 'pending';
  };

  const getEbayStatus = (): StatusIconProps['status'] => {
    if (itemStatus === 'ebay_processing') return 'syncing';
    if (itemStatus === 'ebay_queued') return 'syncing';
    if (itemStatus === 'ebay_synced' || itemStatus === 'printed') return 'synced';
    if (itemStatus === 'ebay_failed') return 'failed';
    return 'pending';
  };

  const getPrintStatus = (): StatusIconProps['status'] => {
    if (itemStatus === 'printed' || printedAt) return 'synced';
    return 'pending';
  };

  return (
    <div className="flex items-center gap-1">
      <StatusIcon platform="S" status={getShopifyStatus()} error={shopifyError} />
      <StatusIcon platform="E" status={getEbayStatus()} error={ebayError} />
      <StatusIcon platform="P" status={getPrintStatus()} />
    </div>
  );
}
