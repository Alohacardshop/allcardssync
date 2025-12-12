import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  History, Loader2, RefreshCw, CheckCircle, XCircle, Eye
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface SyncLogEntry {
  id: string;
  store_key: string;
  sku: string | null;
  operation: string;
  dry_run: boolean;
  before_state: any;
  after_state: any;
  ebay_response: any;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
}

interface EbaySyncLogProps {
  storeKey: string;
}

export function EbaySyncLog({ storeKey }: EbaySyncLogProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadLogs();
  }, [storeKey]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ebay_sync_log')
        .select('*')
        .eq('store_key', storeKey)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      toast.error('Failed to load sync logs: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'preview_sync':
        return 'Preview';
      case 'manual_sync':
        return 'Manual Sync';
      case 'realtime_sync':
        return 'Auto Sync';
      case 'waterfall_decrement':
        return 'Order Fulfillment';
      default:
        return operation;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Sync History
            </CardTitle>
            <CardDescription>
              Audit log of all eBay synchronization operations
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadLogs}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No sync history yet.</p>
            <p className="text-sm">Operations will appear here after running syncs.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {logs.map(log => (
                <Collapsible
                  key={log.id}
                  open={expandedIds.has(log.id)}
                  onOpenChange={() => toggleExpanded(log.id)}
                >
                  <div className="rounded-lg border">
                    <CollapsibleTrigger asChild>
                      <button className="w-full p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
                        {log.success === true ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        ) : log.success === false ? (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        ) : (
                          <Eye className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {getOperationLabel(log.operation)}
                            </span>
                            {log.dry_run && (
                              <Badge variant="secondary" className="text-xs">
                                Dry Run
                              </Badge>
                            )}
                            {log.sku && (
                              <span className="text-xs font-mono text-muted-foreground truncate">
                                {log.sku}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                          </p>
                        </div>

                        {log.error_message && (
                          <Badge variant="destructive" className="text-xs shrink-0">
                            Error
                          </Badge>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 space-y-2 text-sm">
                        {log.error_message && (
                          <div className="p-2 rounded bg-destructive/10 text-destructive">
                            {log.error_message}
                          </div>
                        )}
                        
                        {log.before_state && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Before State:
                            </p>
                            <pre className="p-2 rounded bg-muted text-xs overflow-auto max-h-32">
                              {JSON.stringify(log.before_state, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {log.after_state && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              After State:
                            </p>
                            <pre className="p-2 rounded bg-muted text-xs overflow-auto max-h-32">
                              {JSON.stringify(log.after_state, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {log.ebay_response && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              eBay Response:
                            </p>
                            <pre className="p-2 rounded bg-muted text-xs overflow-auto max-h-32">
                              {JSON.stringify(log.ebay_response, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
