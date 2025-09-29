import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { invalidateWithToast } from '@/lib/queryClient';

interface RefreshButtonProps {
  queryKey: unknown;
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
  showToastOnChange?: boolean;
}

export function RefreshButton({ 
  queryKey, 
  label = "Refresh",
  size = "sm",
  variant = "outline",
  showToastOnChange = false
}: RefreshButtonProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      if (showToastOnChange) {
        await invalidateWithToast(
          queryClient, 
          queryKey,
          (message) => toast({ title: "Updated", description: message })
        );
      } else {
        await queryClient.invalidateQueries({ queryKey: queryKey as any });
      }
      
      toast({
        title: "Refreshed",
        description: "Data has been updated",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not update data",
        variant: "destructive",
      });
    } finally {
      // Add a small delay to show the spinning animation
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="inline-flex items-center gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {label}
    </Button>
  );
}

// Wrapper for multiple query keys (invalidates by prefix)
interface RefreshSectionButtonProps {
  queryKeyPrefix: string;
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost";
}

export function RefreshSectionButton({ 
  queryKeyPrefix, 
  label = "Refresh All",
  size = "sm",
  variant = "outline"
}: RefreshSectionButtonProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      await queryClient.invalidateQueries({ 
        predicate: (query) => {
          const queryKey = query.queryKey;
          return Array.isArray(queryKey) && queryKey[0] === queryKeyPrefix;
        }
      });
      
      toast({
        title: "Section Refreshed",
        description: `All ${queryKeyPrefix} data has been updated`,
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not update section data",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRefresh}
      disabled={isRefreshing}
      className="inline-flex items-center gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {label}
    </Button>
  );
}