import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Loader2, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getLocationNameFromGid, getLocationNicknameFromGid, getLocationDisplayInfoFromGid } from "@/lib/locationUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import Papa from "papaparse";
import { logger } from '@/lib/logger';

interface Transfer {
  id: string;
  created_at: string;
  store_key: string;
  source_location_gid: string;
  destination_location_gid: string;
  total_items: number;
  successful_items: number;
  failed_items: number;
  status: string;
  completed_at: string | null;
}

interface TransferItem {
  id: string;
  sku: string;
  item_name: string;
  quantity: number;
  status: string;
  error_message: string | null;
  processed_at: string;
}

export function TransferHistoryLog() {
  const { toast } = useToast();
  const { availableLocations: locations } = useStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [expandedTransfer, setExpandedTransfer] = useState<string | null>(null);
  const [transferItems, setTransferItems] = useState<Record<string, TransferItem[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadTransfers();
    
    return () => {
      controller.abort();
    };
  }, []);

  const loadTransfers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('location_transfers')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setTransfers(data || []);
    } catch (error) {
      logger.error('Load transfers error', error instanceof Error ? error : new Error(String(error)), undefined, 'transfer-history-log');
      toast({
        title: "Failed to load transfers",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransferItems = async (transferId: string) => {
    if (transferItems[transferId]) {
      return; // Already loaded
    }

    setLoadingItems(transferId);
    try {
      const { data, error } = await supabase
        .from('location_transfer_items')
        .select('*')
        .eq('transfer_id', transferId)
        .order('processed_at', { ascending: false });

      if (error) throw error;

      setTransferItems(prev => ({
        ...prev,
        [transferId]: data || [],
      }));
    } catch (error) {
      logger.error('Load transfer items error', error instanceof Error ? error : new Error(String(error)), undefined, 'transfer-history-log');
      toast({
        title: "Failed to load items",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingItems(null);
    }
  };

  const handleToggleExpand = (transferId: string) => {
    if (expandedTransfer === transferId) {
      setExpandedTransfer(null);
    } else {
      setExpandedTransfer(transferId);
      loadTransferItems(transferId);
    }
  };

  const handleExportToCSV = () => {
    try {
      // Prepare data for export
      const exportData = transfers.flatMap(transfer => {
        const items = transferItems[transfer.id] || [];
        const sourceName = getLocationNameFromGid(transfer.source_location_gid, locations);
        const destName = getLocationNameFromGid(transfer.destination_location_gid, locations);
        
        if (items.length === 0) {
          // Export transfer summary only
          return [{
            'Transfer Date': new Date(transfer.created_at).toLocaleString(),
            'Source Location': sourceName,
            'Destination Location': destName,
            'Total Items': transfer.total_items,
            'Successful': transfer.successful_items,
            'Failed': transfer.failed_items,
            'Status': transfer.status,
            'SKU': '',
            'Item Name': '',
            'Quantity': '',
            'Item Status': '',
            'Error Message': '',
          }];
        }
        
        // Export with item details
        return items.map(item => ({
          'Transfer Date': new Date(transfer.created_at).toLocaleString(),
          'Source Location': sourceName,
          'Destination Location': destName,
          'Total Items': transfer.total_items,
          'Successful': transfer.successful_items,
          'Failed': transfer.failed_items,
          'Status': transfer.status,
          'SKU': item.sku,
          'Item Name': item.item_name || 'Unknown',
          'Quantity': String(item.quantity),
          'Item Status': item.status,
          'Error Message': item.error_message || '',
        }));
      });

      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `transfer-history-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Export successful",
        description: "Transfer history has been exported to CSV",
      });
    } catch (error) {
      logger.error('Export error', error instanceof Error ? error : new Error(String(error)), undefined, 'transfer-history-log');
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: "default",
      partial: "secondary",
      failed: "destructive",
      processing: "outline",
      pending: "outline",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No transfers found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExportToCSV}>
          <Download className="mr-2 h-4 w-4" />
          Export to CSV
        </Button>
      </div>

      <div className="space-y-2">
        {transfers.map((transfer) => {
          const sourceInfo = getLocationDisplayInfoFromGid(transfer.source_location_gid, locations);
          const destInfo = getLocationDisplayInfoFromGid(transfer.destination_location_gid, locations);
          
          return (
            <Collapsible
              key={transfer.id}
              open={expandedTransfer === transfer.id}
              onOpenChange={() => handleToggleExpand(transfer.id)}
            >
              <div className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between p-4 h-auto"
                  >
                    <div className="flex items-center gap-4 text-left">
                      {expandedTransfer === transfer.id ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="font-medium cursor-help">
                              {sourceInfo.nickname} → {destInfo.nickname}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{sourceInfo.fullName} → {destInfo.fullName}</p>
                          </TooltipContent>
                        </Tooltip>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(transfer.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        {transfer.successful_items}/{transfer.total_items} succeeded
                      </div>
                      {getStatusBadge(transfer.status)}
                    </div>
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4">
                    {loadingItems === transfer.id ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : transferItems[transfer.id] ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transferItems[transfer.id].map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>{item.item_name || 'Unknown'}</TableCell>
                              <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {getStatusBadge(item.status)}
                                  {item.error_message && (
                                    <div className="text-xs text-destructive">
                                      {item.error_message}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
