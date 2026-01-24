import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRegionalDateTime } from '@/hooks/useRegionalDateTime';
import { 
  FileText, 
  Search, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  Download,
  Filter,
  User,
  MapPin
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  region_id: string | null;
  location_gid: string | null;
  created_at: string;
}

const REGIONS = [
  { value: 'all', label: 'All Regions', icon: '🌐' },
  { value: 'hawaii', label: 'Hawaii', icon: '🌺' },
  { value: 'las_vegas', label: 'Las Vegas', icon: '🎰' },
];

const ACTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'INSERT', label: 'Created' },
  { value: 'UPDATE', label: 'Updated' },
  { value: 'DELETE', label: 'Deleted' },
];

const TABLES = [
  { value: 'all', label: 'All Tables' },
  { value: 'intake_items', label: 'Intake Items' },
  { value: 'shopify_stores', label: 'Shopify Stores' },
  { value: 'region_settings', label: 'Region Settings' },
  { value: 'user_roles', label: 'User Roles' },
];

export function RegionalAuditLog() {
  const { formatRelative, formatDateTime } = useRegionalDateTime();
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(100);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', regionFilter, actionFilter, tableFilter, search, limit],
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (regionFilter !== 'all') {
        query = query.eq('region_id', regionFilter);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }

      if (search) {
        query = query.or(`record_id.ilike.%${search}%,user_email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLogEntry[];
    },
  });

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-green-600">Created</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-600">Updated</Badge>;
      case 'DELETE':
        return <Badge variant="destructive">Deleted</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const getRegionIcon = (regionId: string | null) => {
    switch (regionId) {
      case 'hawaii':
        return '🌺';
      case 'las_vegas':
        return '🎰';
      default:
        return '📍';
    }
  };

  const getChangedFields = (oldData: Record<string, any> | null, newData: Record<string, any> | null) => {
    if (!oldData || !newData) return [];
    
    const changes: { field: string; oldValue: any; newValue: any }[] = [];
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    
    allKeys.forEach(key => {
      if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
        changes.push({
          field: key,
          oldValue: oldData[key],
          newValue: newData[key],
        });
      }
    });
    
    return changes;
  };

  const exportToCSV = () => {
    if (!logs) return;
    
    const headers = ['Timestamp', 'User', 'Region', 'Action', 'Table', 'Record ID'];
    const rows = logs.map(log => [
      formatDateTime(log.created_at),
      log.user_email || 'System',
      log.region_id || 'N/A',
      log.action,
      log.table_name,
      log.record_id || 'N/A',
    ]);
    
    const csv = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Regional Audit Trail
            </CardTitle>
            <CardDescription>
              Track all database changes across regions with detailed before/after snapshots
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by record ID or user email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
          </div>
          
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map(region => (
                <SelectItem key={region.value} value={region.value}>
                  <span className="flex items-center gap-2">
                    <span>{region.icon}</span>
                    <span>{region.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map(action => (
                <SelectItem key={action.value} value={action.value}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Table" />
            </SelectTrigger>
            <SelectContent>
              {TABLES.map(table => (
                <SelectItem key={table.value} value={table.value}>
                  {table.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Logs Table */}
        <ScrollArea className="h-[500px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30px]"></TableHead>
                <TableHead className="w-[120px]">Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="w-[80px]">Region</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading audit logs...
                  </TableCell>
                </TableRow>
              ) : !logs?.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  const changes = getChangedFields(log.old_data, log.new_data);
                  
                  return (
                    <Collapsible key={log.id} open={isExpanded} onOpenChange={() => toggleRow(log.id)}>
                      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(log.id)}>
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatRelative(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm truncate max-w-[150px]">
                              {log.user_email || 'System'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-lg" title={log.region_id || 'Unknown'}>
                            {getRegionIcon(log.region_id)}
                          </span>
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell className="text-sm font-mono">
                          {log.table_name}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground truncate max-w-[150px]">
                          {log.record_id}
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="p-4">
                            <div className="space-y-3">
                              <div className="text-xs text-muted-foreground">
                                {formatDateTime(log.created_at)}
                                {log.location_gid && (
                                  <span className="ml-4 flex items-center gap-1 inline-flex">
                                    <MapPin className="h-3 w-3" />
                                    Location: {log.location_gid}
                                  </span>
                                )}
                              </div>
                              
                              {log.action === 'UPDATE' && changes.length > 0 ? (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Changed Fields:</p>
                                  <div className="grid gap-2">
                                    {changes.slice(0, 5).map((change, idx) => (
                                      <div key={idx} className="flex items-start gap-4 text-sm bg-background p-2 rounded border">
                                        <span className="font-mono text-muted-foreground min-w-[120px]">
                                          {change.field}
                                        </span>
                                        <span className="text-red-600 line-through truncate max-w-[200px]">
                                          {JSON.stringify(change.oldValue)}
                                        </span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="text-green-600 truncate max-w-[200px]">
                                          {JSON.stringify(change.newValue)}
                                        </span>
                                      </div>
                                    ))}
                                    {changes.length > 5 && (
                                      <p className="text-xs text-muted-foreground">
                                        + {changes.length - 5} more changes
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ) : log.action === 'INSERT' && log.new_data ? (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Created Record:</p>
                                  <pre className="text-xs bg-background p-2 rounded border overflow-auto max-h-[150px]">
                                    {JSON.stringify(log.new_data, null, 2)}
                                  </pre>
                                </div>
                              ) : log.action === 'DELETE' && log.old_data ? (
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Deleted Record:</p>
                                  <pre className="text-xs bg-background p-2 rounded border overflow-auto max-h-[150px]">
                                    {JSON.stringify(log.old_data, null, 2)}
                                  </pre>
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No additional details available</p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Load More */}
        {logs && logs.length >= limit && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setLimit(prev => prev + 100)}>
              Load More
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
