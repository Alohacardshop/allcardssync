import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  RefreshCw,
  Search,
  ShoppingCart,
  Package,
  CheckCircle,
  AlertTriangle,
  Ban,
  Clock,
  Loader2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

type SaleEventStatus = "received" | "processed" | "ignored" | "failed";
type SaleSource = "shopify" | "ebay";

interface SaleEvent {
  id: string;
  source: SaleSource;
  source_event_id: string;
  sku: string;
  status: SaleEventStatus;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

const statusConfig: Record<SaleEventStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  received: { label: "Received", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  processed: { label: "Processed", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  ignored: { label: "Ignored", variant: "outline", icon: <Ban className="h-3 w-3" /> },
  failed: { label: "Failed", variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
};

const sourceConfig: Record<SaleSource, { label: string; icon: React.ReactNode; color: string }> = {
  shopify: { label: "Shopify", icon: <ShoppingCart className="h-4 w-4" />, color: "bg-accent/50 text-accent-foreground" },
  ebay: { label: "eBay", icon: <Package className="h-4 w-4" />, color: "bg-secondary/50 text-secondary-foreground" },
};

export function SalesEventLog() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SaleEventStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | SaleSource>("all");

  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["sales-events", statusFilter, sourceFilter],
    queryFn: async () => {
      let query = supabase
        .from("sales_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SaleEvent[];
    },
    refetchInterval: 30000,
  });

  const filteredEvents = events.filter((event) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      event.sku.toLowerCase().includes(term) ||
      event.source_event_id.toLowerCase().includes(term)
    );
  });

  const stats = {
    total: events.length,
    processed: events.filter((e) => e.status === "processed").length,
    ignored: events.filter((e) => e.status === "ignored").length,
    failed: events.filter((e) => e.status === "failed").length,
    shopify: events.filter((e) => e.source === "shopify").length,
    ebay: events.filter((e) => e.source === "ebay").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sales Event Log
            </CardTitle>
            <CardDescription>
              Track sales events from all channels with idempotency keys
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-xs text-muted-foreground">Total Events</p>
            <p className="text-xl font-bold">{stats.total}</p>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-xs text-muted-foreground">Processed</p>
            <p className="text-xl font-bold text-primary">{stats.processed}</p>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-xs text-muted-foreground">Ignored</p>
            <p className="text-xl font-bold text-muted-foreground">{stats.ignored}</p>
          </div>
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-xl font-bold text-destructive">{stats.failed}</p>
          </div>
          <div className="p-3 rounded-lg border bg-accent/30">
            <p className="text-xs text-muted-foreground">Shopify</p>
            <p className="text-xl font-bold text-primary">{stats.shopify}</p>
          </div>
          <div className="p-3 rounded-lg border bg-secondary/30">
            <p className="text-xs text-muted-foreground">eBay</p>
            <p className="text-xl font-bold text-secondary-foreground">{stats.ebay}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by SKU or event ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="ebay">eBay</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-2" />
            <p className="text-muted-foreground">No events found</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.map((event) => {
                  const statusCfg = statusConfig[event.status];
                  const sourceCfg = sourceConfig[event.source];
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded w-fit ${sourceCfg.color}`}>
                          {sourceCfg.icon}
                          <span className="text-xs font-medium">{sourceCfg.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-medium">{event.sku}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground" title={event.source_event_id}>
                          {event.source_event_id.slice(0, 20)}...
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusCfg.variant} className="flex items-center gap-1 w-fit">
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {event.processed_at
                          ? format(new Date(event.processed_at), "HH:mm:ss")
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {event.error ? (
                          <span className="text-xs text-destructive truncate block" title={event.error}>
                            {event.error.slice(0, 40)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
