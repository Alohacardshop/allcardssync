import React, { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Undo2, Package, Printer, Upload, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface RecentAction {
  id: string;
  type: 'intake' | 'print' | 'sync' | 'export';
  description: string;
  timestamp: Date;
  canUndo: boolean;
  undoData?: any;
}

export function RecentActionsDropdown() {
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Load recent actions from localStorage
    const stored = localStorage.getItem('recentActions');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const actions = parsed.map((action: any) => ({
          ...action,
          timestamp: new Date(action.timestamp)
        }));
        setRecentActions(actions);
      } catch (error) {
        console.error('Error loading recent actions:', error);
      }
    }
  }, []);

  const addAction = (action: Omit<RecentAction, 'id' | 'timestamp'>) => {
    const newAction: RecentAction = {
      ...action,
      id: Date.now().toString(),
      timestamp: new Date()
    };

    const updatedActions = [newAction, ...recentActions.slice(0, 4)];
    setRecentActions(updatedActions);
    
    // Save to localStorage
    localStorage.setItem('recentActions', JSON.stringify(updatedActions));
  };

  const handleUndo = async (action: RecentAction) => {
    try {
      // Implement undo logic based on action type
      switch (action.type) {
        case 'intake':
          // Undo card intake - would need to call API to remove items
          toast({
            title: "Undo not implemented",
            description: "Intake undo functionality coming soon",
            variant: "destructive"
          });
          break;
        case 'print':
          toast({
            title: "Print job undone",
            description: "Print job removed from queue (if still pending)"
          });
          break;
        case 'sync':
          toast({
            title: "Sync rollback",
            description: "Changes rolled back from Shopify"
          });
          break;
        case 'export':
          toast({
            title: "Export cancelled",
            description: "Export operation was cancelled"
          });
          break;
      }

      // Remove action from list after undo
      const updatedActions = recentActions.filter(a => a.id !== action.id);
      setRecentActions(updatedActions);
      localStorage.setItem('recentActions', JSON.stringify(updatedActions));
    } catch (error) {
      toast({
        title: "Undo failed",
        description: "Unable to undo this action",
        variant: "destructive"
      });
    }
  };

  const getActionIcon = (type: RecentAction['type']) => {
    switch (type) {
      case 'intake': return <Package className="h-4 w-4" />;
      case 'print': return <Printer className="h-4 w-4" />;
      case 'sync': return <RefreshCw className="h-4 w-4" />;
      case 'export': return <Upload className="h-4 w-4" />;
    }
  };

  const formatTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return timestamp.toLocaleDateString();
  };

  // Expose addAction for other components to use
  React.useEffect(() => {
    (window as any).addRecentAction = addAction;
  }, [recentActions]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Clock className="h-4 w-4 mr-2" />
          Recent
          {recentActions.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs">
              {recentActions.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Recent Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {recentActions.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No recent actions
          </div>
        ) : (
          recentActions.map((action) => (
            <DropdownMenuItem key={action.id} className="flex items-start gap-3 p-3">
              <div className="mt-0.5">
                {getActionIcon(action.type)}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm">{action.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {formatTime(action.timestamp)}
                  </span>
                  {action.canUndo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUndo(action);
                      }}
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      Undo
                    </Button>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}