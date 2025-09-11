import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight, RefreshCw, Trash2, Search, Filter, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface SystemLog {
  id: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  context: any;
  source: string | null;
  user_id: string | null;
  error_details: any;
  metadata: any;
  created_at: string;
}

export function SystemLogsViewer() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [accessError, setAccessError] = useState<{type: 'permission' | 'missing-table' | null, details?: any}>({type: null});
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setAccessError({type: null});

      // Lightweight access self-check first
      const { data: checkData, error: checkError } = await supabase
        .from("system_logs")
        .select("id")
        .limit(1);

      if (checkError) {
        const errorCode = checkError.code;
        if (errorCode === '42501' || errorCode === '403' || errorCode === '401') {
          setAccessError({type: 'permission', details: checkError});
          toast.error(`Access denied: ${checkError.message}`, {
            description: `Error code: ${errorCode}`,
            action: {
              label: "Details",
              onClick: () => setShowErrorDetails(!showErrorDetails)
            }
          });
          return;
        } else if (errorCode === '42P01') {
          setAccessError({type: 'missing-table', details: checkError});
          toast.error(`Table not found: ${checkError.message}`, {
            description: `Error code: ${errorCode}`,
            action: {
              label: "Details", 
              onClick: () => setShowErrorDetails(!showErrorDetails)
            }
          });
          return;
        } else {
          throw checkError;
        }
      }

      // If check passed with 0 rows, show "No logs yet"
      if (checkData && checkData.length === 0) {
        setLogs([]);
        return;
      }

      // Main query
      let query = supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (levelFilter !== "all") {
        query = query.eq("level", levelFilter);
      }

      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      if (search) {
        query = query.or(`message.ilike.%${search}%,source.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs((data || []) as SystemLog[]);
    } catch (error: any) {
      console.error("Error loading logs:", error);
      const errorCode = error?.code;
      toast.error(`Failed to load logs: ${error.message}`, {
        description: errorCode ? `Error code: ${errorCode}` : undefined,
        action: {
          label: "Details",
          onClick: () => setShowErrorDetails(!showErrorDetails)
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteOldLogs = async (daysOld: number) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabase
        .from("system_logs")
        .delete()
        .lt("created_at", cutoffDate.toISOString());

      if (error) throw error;
      
      toast.success(`Deleted logs older than ${daysOld} days`);
      loadLogs();
    } catch (error) {
      console.error("Error deleting logs:", error);
      toast.error("Failed to delete old logs");
    }
  };

  const toggleLogExpansion = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getLogLevelBadge = (level: string) => {
    const variants = {
      error: "destructive" as const,
      warn: "secondary" as const,
      info: "default" as const,
      debug: "outline" as const,
    };
    return <Badge variant={variants[level as keyof typeof variants] || "default"}>{level}</Badge>;
  };

  const getLogLevelColor = (level: string) => {
    const colors = {
      error: "border-l-red-500",
      warn: "border-l-yellow-500",
      info: "border-l-blue-500",
      debug: "border-l-gray-500",
    };
    return colors[level as keyof typeof colors] || "border-l-gray-500";
  };

  // Get unique sources for filter
  const uniqueSources = [...new Set(logs.map(log => log.source).filter(Boolean))] as string[];

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy to clipboard"); 
    }
  };

  const getCurrentUserEmail = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email || 'your@email.com';
  };

  const generateAdminSQL = async () => {
    const email = await getCurrentUserEmail();
    return `-- Replace email with yours
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users where email = '${email}'
on conflict (user_id, role) do nothing;`;
  };

  useEffect(() => {
    loadLogs();
  }, [search, levelFilter, sourceFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            System Logs
            <div className="flex gap-2">
              <Button onClick={loadLogs} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Access Error Alerts */}
          {accessError.type && (
            <div className="space-y-4 mb-6">
              {accessError.type === 'permission' && (
                <Alert className="border-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p><strong>You're signed in but don't have permission to view logs.</strong></p>
                      <p>Ask an admin to grant the admin role, or run this SQL in Supabase:</p>
                      <div className="bg-muted p-3 rounded font-mono text-sm relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute top-2 right-2 h-6 w-6 p-0"
                          onClick={async () => {
                            const sql = await generateAdminSQL();
                            copyToClipboard(sql);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <div id="admin-sql">
                          {`-- Replace email with yours
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users where email = 'admin@alohacardshop.com'
on conflict (user_id, role) do nothing;`}
                        </div>
                      </div>
                      <Button onClick={loadLogs} variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              
              {accessError.type === 'missing-table' && (
                <Alert className="border-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <p><strong>Logging tables not found.</strong></p>
                      <p>Apply the latest migrations to create the system_logs table.</p>
                      <Button onClick={loadLogs} variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {showErrorDetails && accessError.details && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Error Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(accessError.details, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="space-y-4 mb-6">
            {/* Quick Filter Shortcuts */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground mr-2 self-center">Quick filters:</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSearch('send_to_inventory');
                  setSourceFilter('all');
                }}
              >
                Send to Inventory
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSearch('v2-shopify');
                  setSourceFilter('all');
                }}
              >
                Shopify v2 Sync
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSearch('correlation');
                  setSourceFilter('all');
                }}
              >
                Correlation IDs
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setSearch('');
                  setLevelFilter('error');
                  setSourceFilter('all');
                }}
              >
                Errors Only
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSearch('');
                  setLevelFilter('all');
                  setSourceFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </div>
            
            {/* Advanced Filters */}
            <div className="flex gap-4 flex-wrap">
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-32">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="debug">Debug</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {uniqueSources.map(source => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Log Management */}
          <Tabs defaultValue="logs" className="space-y-4">
            <TabsList>
              <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
              <TabsTrigger value="management">Management</TabsTrigger>
            </TabsList>

            <TabsContent value="logs">
              <ScrollArea className="h-[600px] border rounded-lg">
                <div className="space-y-2 p-4">
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
                  ) : accessError.type ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {accessError.type === 'permission' ? 'Access denied' : 'Table not found'}
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No logs yet.</div>
                  ) : (
                    logs.map((log) => (
                      <Collapsible key={log.id}>
                        <CollapsibleTrigger asChild>
                          <Card className={`cursor-pointer hover:bg-muted/50 border-l-4 ${getLogLevelColor(log.level)}`} 
                                onClick={() => toggleLogExpansion(log.id)}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                   <div className="flex items-center gap-2 mb-2">
                                     {expandedLogs.has(log.id) ? (
                                       <ChevronDown className="w-4 h-4" />
                                     ) : (
                                       <ChevronRight className="w-4 h-4" />
                                     )}
                                     {getLogLevelBadge(log.level)}
                                     {log.source && (
                                       <Badge variant="outline" className="text-xs">
                                         {log.source}
                                       </Badge>
                                     )}
                                     {/* Show correlation ID if present */}
                                     {(log.context?.correlationId || log.metadata?.correlationId) && (
                                       <Badge variant="secondary" className="text-xs font-mono">
                                         {log.context?.correlationId || log.metadata?.correlationId}
                                       </Badge>
                                     )}
                                     <span className="text-xs text-muted-foreground">
                                       {format(new Date(log.created_at), 'MMM dd, HH:mm:ss')}
                                     </span>
                                   </div>
                                  <p className="text-sm font-medium truncate">{log.message}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <Card className="mt-2 ml-6">
                            <CardContent className="p-4 space-y-4">
                              <div>
                                <h4 className="font-semibold text-sm mb-2">Full Message</h4>
                                <p className="text-sm bg-muted p-2 rounded">{log.message}</p>
                              </div>
                              
                              {log.context && (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Context</h4>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                    {JSON.stringify(log.context, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {log.error_details && (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Error Details</h4>
                                  <pre className="text-xs bg-red-50 p-2 rounded overflow-x-auto border border-red-200">
                                    {JSON.stringify(log.error_details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              {log.metadata && (
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Metadata</h4>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                              
                              <div className="text-xs text-muted-foreground border-t pt-2">
                                <span>Log ID: {log.id}</span>
                                {log.user_id && <span className="ml-4">User ID: {log.user_id}</span>}
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleContent>
                      </Collapsible>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="management">
              <Card>
                <CardHeader>
                  <CardTitle>Log Management</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Cleanup Old Logs</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Delete logs older than the specified number of days to keep the database clean.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => deleteOldLogs(7)} variant="outline" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete 7+ days
                      </Button>
                      <Button onClick={() => deleteOldLogs(30)} variant="outline" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete 30+ days
                      </Button>
                      <Button onClick={() => deleteOldLogs(90)} variant="outline" size="sm">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete 90+ days
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}