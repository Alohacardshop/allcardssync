import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Printer, WifiOff, AlertCircle } from 'lucide-react';
import { usePrintQueueContext } from '@/contexts/PrintQueueContext';
import { useQzTray } from '@/hooks/useQzTray';

interface PrinterStatusBadgeProps {
  onClick?: () => void;
}

export function PrinterStatusBadge({ onClick }: PrinterStatusBadgeProps) {
  const { printerName, isReady } = usePrintQueueContext();
  const { isConnected: qzConnected } = useQzTray();

  const getStatus = () => {
    if (!qzConnected) {
      return {
        variant: 'destructive' as const,
        icon: WifiOff,
        label: 'QZ Disconnected',
        tooltip: 'QZ Tray is not connected. Click to configure.',
      };
    }
    if (!printerName) {
      return {
        variant: 'secondary' as const,
        icon: AlertCircle,
        label: 'No Printer',
        tooltip: 'No printer selected. Click to configure.',
      };
    }
    if (!isReady) {
      return {
        variant: 'secondary' as const,
        icon: AlertCircle,
        label: 'Not Ready',
        tooltip: `Printer "${printerName}" is not ready. Click to check settings.`,
      };
    }
    return {
      variant: 'default' as const,
      icon: Printer,
      label: printerName.length > 15 ? printerName.substring(0, 15) + '...' : printerName,
      tooltip: `Ready: ${printerName}`,
    };
  };

  const status = getStatus();
  const Icon = status.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={status.variant}
            className="cursor-pointer gap-1.5 px-2 py-1"
            onClick={onClick}
          >
            <Icon className="h-3 w-3" />
            <span className="text-xs">{status.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{status.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
