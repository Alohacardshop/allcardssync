import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRegionalDateTime } from '@/hooks/useRegionalDateTime';
import { useRegionSettings } from '@/hooks/useRegionSettings';
import { Clock } from 'lucide-react';

interface StoreStatusIndicatorProps {
  showTime?: boolean;
  compact?: boolean;
}

export function StoreStatusIndicator({ showTime = true, compact = false }: StoreStatusIndicatorProps) {
  const { isStoreOpen, getCurrentTime, getNextOpenTime, timezone } = useRegionalDateTime();
  const { businessHours, icon, displayName } = useRegionSettings();
  const [currentTime, setCurrentTime] = useState(getCurrentTime());
  const [isOpen, setIsOpen] = useState(isStoreOpen());

  useEffect(() => {
    const updateStatus = () => {
      setCurrentTime(getCurrentTime());
      setIsOpen(isStoreOpen());
    };
    
    updateStatus();
    const interval = setInterval(updateStatus, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [getCurrentTime, isStoreOpen]);

  const formatHour = (hour: number) => {
    const h = hour > 12 ? hour - 12 : hour;
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${h}${suffix}`;
  };

  const hoursText = businessHours 
    ? `${formatHour(businessHours.start)} - ${formatHour(businessHours.end)}`
    : '10AM - 7PM';

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <div className={`w-2 h-2 rounded-full ${isOpen ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
              <span className="text-xs text-muted-foreground">
                {isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-center">
            <div className="font-medium">{icon} {displayName}</div>
            <div className="text-xs text-muted-foreground">
              Hours: {hoursText} ({timezone.split('/')[1]?.replace('_', ' ') || timezone})
            </div>
            {!isOpen && (
              <div className="text-xs mt-1">Opens {getNextOpenTime()}</div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <Badge 
              variant={isOpen ? 'default' : 'secondary'}
              className={`gap-1.5 ${isOpen ? 'bg-green-600 hover:bg-green-600 text-white' : ''}`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-white animate-pulse' : 'bg-muted-foreground'}`} />
              {isOpen ? 'Open' : 'Closed'}
            </Badge>
            {showTime && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{currentTime}</span>
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-center">
          <div className="font-medium">{icon} {displayName}</div>
          <div className="text-xs text-muted-foreground">
            Hours: {hoursText}
          </div>
          <div className="text-xs text-muted-foreground">
            Timezone: {timezone.split('/')[1]?.replace('_', ' ') || timezone}
          </div>
          {!isOpen && (
            <div className="text-xs mt-1 text-primary">Opens {getNextOpenTime()}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
