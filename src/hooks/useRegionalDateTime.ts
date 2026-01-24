import { useCallback, useMemo } from 'react';
import { useRegionSettings } from '@/hooks/useRegionSettings';

/**
 * Hook for consistent regional date/time formatting based on user's assigned region
 * Uses Intl.DateTimeFormat for proper timezone handling
 */
export function useRegionalDateTime() {
  const { businessHours, regionId } = useRegionSettings();
  
  const timezone = useMemo(() => {
    return businessHours?.timezone || (regionId === 'hawaii' ? 'Pacific/Honolulu' : 'America/Los_Angeles');
  }, [businessHours, regionId]);

  const formatDateTime = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  }, [timezone]);

  const formatDate = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'medium',
    }).format(d);
  }, [timezone]);

  const formatTime = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeStyle: 'short',
    }).format(d);
  }, [timezone]);

  const formatRelative = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return formatDate(d);
  }, [formatDate]);

  const getCurrentTime = useCallback(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  }, [timezone]);

  const getCurrentHour = useCallback(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  }, [timezone]);

  const getCurrentDay = useCallback(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(new Date());
    return parts.find(p => p.type === 'weekday')?.value ?? '';
  }, [timezone]);

  const isStoreOpen = useCallback(() => {
    const hour = getCurrentHour();
    const day = getCurrentDay();
    
    // Closed on Sundays
    if (day === 'Sun') return false;
    
    const start = businessHours?.start ?? 10;
    const end = businessHours?.end ?? 19;
    
    return hour >= start && hour < end;
  }, [getCurrentHour, getCurrentDay, businessHours]);

  const getNextOpenTime = useCallback(() => {
    const hour = getCurrentHour();
    const day = getCurrentDay();
    const start = businessHours?.start ?? 10;
    
    if (day === 'Sun') {
      return `Monday ${start > 12 ? start - 12 : start}${start >= 12 ? 'PM' : 'AM'}`;
    }
    
    if (hour < start) {
      return `${start > 12 ? start - 12 : start}${start >= 12 ? 'PM' : 'AM'} today`;
    }
    
    return `${start > 12 ? start - 12 : start}${start >= 12 ? 'PM' : 'AM'} tomorrow`;
  }, [getCurrentHour, getCurrentDay, businessHours]);

  return {
    timezone,
    formatDateTime,
    formatDate,
    formatTime,
    formatRelative,
    getCurrentTime,
    getCurrentHour,
    getCurrentDay,
    isStoreOpen,
    getNextOpenTime,
  };
}
