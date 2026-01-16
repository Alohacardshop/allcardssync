import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  Skull, 
  RotateCcw, 
  Archive, 
  ChevronDown, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Download
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface DeadLetterItem {
  id: string;
  original_queue_id: string;
  inventory_item_id: string;
  action: string;
  error_message: string | null;
  error_type: string | null;
  retry_count: number;
  item_snapshot: any;
  failure_context: any;
  created_at: string;
  archived_at: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface FailureAnalysis {
  error_type: string;
  failure_count: number;
  first_failure: string;
  last_failure: string;
  unresolved_count: number;
}

export function DeadLetterDashboard() {
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<DeadLetterItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch dead letter items
  const { data: deadLetterItems = [], isLoading } = useQuery({
    queryKey: ['dead-letter-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopify_dead_letter_queue')
        .select('*')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as DeadLetterItem[];
    },
    refetchInterval: 30000
  });

  // Fetch failure analysis
  const { data: failureAnalysis = [] } = useQuery({
    queryKey: ['dead-letter-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dead_letter_failure_analysis')
        .select('*');
      
      if (error) throw error;
      return data as FailureAnalysis[];
    },
    refetchInterval: 60000
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (item: DeadLetterItem) => {
      // Re-add to sync queue
      const { error: insertError } = await supabase
        .from('shopify_sync_queue')
        .insert({
          inventory_item_id: item.inventory_item_id,
          action: item.action,
          status: 'queued',
          retry_count: 0
        });
      
      if (insertError) throw insertError;

      // Mark as resolved in dead letter queue
      const { error: updateError } = await supabase
        .from('shopify_dead_letter_queue')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Retried manually'
        })
        .eq('id', item.id);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success('Item queued for retry');
      queryClient.invalidateQueries({ queryKey: ['dead-letter-queue'] });
      queryClient.invalidateQueries({ queryKey: ['dead-letter-analysis'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to retry: ${error.message}`);
    }
  });

  // Resolve mutation
  const resolveMutation = useMutation({
    mutationFn: async ({ item, notes }: { item: DeadLetterItem; notes: string }) => {
      const { error } = await supabase
        .from('shopify_dead_letter_queue')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_notes: notes
        })
        .eq('id', item.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Item marked as resolved');
      setShowResolveDialog(false);
      setSelectedItem(null);
      setResolutionNotes("");
      queryClient.invalidateQueries({ queryKey: ['dead-letter-queue'] });
      queryClient.invalidateQueries({ queryKey: ['dead-letter-analysis'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to resolve: ${error.message}`);
    }
  });

  // Archive mutation (bulk)
  const archiveMutation = useMutation({
    mutationFn: async (errorType: string) => {
      const { error } = await supabase
        .from('shopify_dead_letter_queue')
        .update({
          archived_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(),
          resolution_notes: `Bulk archived (error type: ${errorType})`
        })
        .eq('error_type', errorType)
        .is('resolved_at', null);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Items archived');
      queryClient.invalidateQueries({ queryKey: ['dead-letter-queue'] });
      queryClient.invalidateQueries({ queryKey: ['dead-letter-analysis'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to archive: ${error.message}`);
    }
  });

  const exportToCSV = () => {
    const headers = ['ID', 'Item ID', 'Action', 'Error Type', 'Error Message', 'Retry Count', 'Created At'];
    const rows = deadLetterItems.map(item => [
      item.id,
      item.inventory_item_id,
      item.action,
      item.error_type || '',
      item.error_message || '',
      item.retry_count.toString(),
      item.created_at
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dead-letter-queue-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = deadLetterItems.filter(item =>
    item.inventory_item_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.error_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.error_message?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getErrorTypeColor = (errorType: string | null) => {
    switch (errorType) {
      case 'RATE_LIMIT': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      case 'SERVER_ERROR': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'NOT_FOUND': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'CLIENT_ERROR': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const totalUnresolved = failureAnalysis.reduce((sum, f) => sum + f.unresolved_count, 0);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unresolved</p>
                <p className="text-2xl font-bold">{totalUnresolved}</p>
              </div>
              <Skull className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Error Types</p>
                <p className="text-2xl font-bold">{failureAnalysis.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rate Limit Errors</p>
                <p className="text-2xl font-bold">
                  {failureAnalysis.find(f => f.error_type === 'RATE_LIMIT')?.unresolved_count || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Client Errors</p>
                <p className="text-2xl font-bold">
                  {failureAnalysis.find(f => f.error_type === 'CLIENT_ERROR')?.unresolved_count || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failure Analysis by Type */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Failure Analysis by Type
          </CardTitle>
          <CardDescription>
            Click to archive all failures of a specific type
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failureAnalysis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No failed items in the dead letter queue</p>
            </div>
          ) : (
            <div className="space-y-2">
              {failureAnalysis.map((analysis) => (
                <div
                  key={analysis.error_type}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Badge className={getErrorTypeColor(analysis.error_type)}>
                      {analysis.error_type || 'UNKNOWN'}
                    </Badge>
                    <div>
                      <p className="font-medium">{analysis.failure_count} failures</p>
                      <p className="text-xs text-muted-foreground">
                        {analysis.unresolved_count} unresolved • Last: {format(new Date(analysis.last_failure), 'MMM d, HH:mm')}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveMutation.mutate(analysis.error_type)}
                    disabled={archiveMutation.isPending}
                  >
                    <Archive className="h-4 w-4 mr-1" />
                    Archive All
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dead Letter Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Skull className="h-5 w-5" />
                Dead Letter Queue
              </CardTitle>
              <CardDescription>
                Items that failed permanently after max retries
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>No items in dead letter queue</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <Collapsible key={item.id}>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <p className="font-medium text-sm">
                          {item.action.toUpperCase()} • {item.inventory_item_id.slice(0, 8)}...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')} • {item.retry_count} retries
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getErrorTypeColor(item.error_type)}>
                        {item.error_type || 'UNKNOWN'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => retryMutation.mutate(item)}
                        disabled={retryMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedItem(item);
                          setShowResolveDialog(true);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-2">Error Message:</p>
                      <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-background p-2 rounded">
                        {item.error_message || 'No error message'}
                      </pre>
                      {item.item_snapshot && (
                        <>
                          <p className="font-medium mt-3 mb-2">Item Snapshot:</p>
                          <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-background p-2 rounded max-h-40 overflow-auto">
                            {JSON.stringify(item.item_snapshot, null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <AlertDialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Dead Letter Item</AlertDialogTitle>
            <AlertDialogDescription>
              Add notes explaining why this item was resolved without retry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Resolution notes (e.g., 'Item no longer exists', 'Duplicate entry')"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            className="min-h-24"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && resolveMutation.mutate({ item: selectedItem, notes: resolutionNotes })}
              disabled={resolveMutation.isPending}
            >
              Mark as Resolved
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
