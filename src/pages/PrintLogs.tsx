import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Eye, RotateCcw, Filter, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { printNodeService } from "@/lib/printNodeService";

interface PrintJob {
  id: string;
  workstation_id: string;
  status: 'queued' | 'sent' | 'error' | 'reprinted';
  copies: number;
  language: string;
  payload: string;
  error?: string;
  created_at: string;
}

export default function PrintLogs() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [filters, setFilters] = useState({
    status: 'all',
    workstation: 'all',
    dateRange: '7' // days
  });
  const [canDelete, setCanDelete] = useState(false);

  // Load print jobs
  useEffect(() => {
    loadPrintJobs();
  }, []);

  // Determine if user can delete (admin or staff)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        if (error) {
          console.error('Role fetch error:', error);
          return;
        }
        const roles = (data || []).map((r: any) => r.role);
        setCanDelete(roles.includes('admin') || roles.includes('staff'));
      } catch (err) {
        console.error('Role check failed:', err);
      }
    })();
  }, []);

  // Apply filters when jobs or filters change
  useEffect(() => {
    applyFilters();
  }, [jobs, filters]);

  const loadPrintJobs = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('print_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setJobs(data || []);
    } catch (err) {
      console.error('Failed to load print jobs:', err);
      const msg = (err as any)?.message || (err as any)?.error_description || 'Failed to load print jobs';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...jobs];

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(job => job.status === filters.status);
    }

    // Workstation filter
    if (filters.workstation !== 'all') {
      filtered = filtered.filter(job => job.workstation_id === filters.workstation);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const days = parseInt(filters.dateRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter(job => new Date(job.created_at) >= cutoff);
    }

    setFilteredJobs(filtered);
  };

  const reprintJob = async (job: PrintJob) => {
    try {
      // Update job status to reprinted
      const { error } = await (supabase as any)
        .from('print_jobs')
        .update({ status: 'reprinted' })
        .eq('id', job.id);

      if (error) throw error;

      // Create new job for reprint
      const { data: newJob, error: insertError } = await (supabase as any)
        .from('print_jobs')
        .insert({
          workstation_id: job.workstation_id,
          status: 'queued',
          copies: job.copies,
          language: job.language,
          payload: job.payload
        })
        .select()
        .single();

      if (insertError) throw insertError;

      try {
        // Initialize PrintNode service first
        await printNodeService.initialize();
        
        // Get available printers
        const printers = await printNodeService.getPrinters();
        if (printers.length === 0) {
          throw new Error('No printers available');
        }
        
        // Use first available printer or saved selection from localStorage
        const savedPrinterId = localStorage.getItem('printnode-selected-printer');
        const printerId = savedPrinterId ? parseInt(savedPrinterId) : printers[0].id;
        
        // Send to printer using PrintNode
        await printNodeService.printRAW(job.payload, printerId, { 
          title: `Reprint Job ${job.id}`, 
          copies: job.copies 
        });
        
        // Update new job status
        await (supabase as any)
          .from('print_jobs')
          .update({ status: 'sent' })
          .eq('id', newJob.id);

        toast.success('Job reprinted successfully');
        loadPrintJobs(); // Refresh the list
        
      } catch (printError) {
        // Update new job with error
        await (supabase as any)
          .from('print_jobs')
          .update({ 
            status: 'error', 
            error: printError instanceof Error ? printError.message : 'Reprint failed' 
          })
          .eq('id', newJob.id);
        
        throw printError;
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reprint failed');
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this print job?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('print_jobs')
        .delete()
        .eq('id', jobId);

      if (error) throw error;

      toast.success('Print job deleted successfully');
      loadPrintJobs(); // Refresh the list
    } catch (err) {
      console.error('Delete error:', err);
      const msg = (err as any)?.message || (err as any)?.error_description || 'Failed to delete print job';
      toast.error(msg);
    }
  };

  const clearAllJobs = async () => {
    if (!confirm('Are you sure you want to delete ALL print jobs? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('print_jobs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      toast.success('All print jobs cleared');
      loadPrintJobs(); // Refresh the list
    } catch (err) {
      console.error('Clear all error:', err);
      const msg = (err as any)?.message || (err as any)?.error_description || 'Failed to clear print jobs';
      toast.error(msg);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      queued: 'secondary',
      sent: 'default',
      error: 'destructive',
      reprinted: 'outline'
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const uniqueWorkstations = [...new Set(jobs.map(job => job.workstation_id))];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Print Logs</h1>
            <p className="text-muted-foreground mt-1">View and manage print job history and status.</p>
          </div>
          <Navigation />
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
          {/* Filters */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            
            <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="reprinted">Reprinted</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.workstation} onValueChange={(value) => setFilters(prev => ({ ...prev, workstation: value }))}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Workstation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workstations</SelectItem>
                {uniqueWorkstations.map(ws => (
                  <SelectItem key={ws} value={ws}>{ws}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last Day</SelectItem>
                <SelectItem value="7">Last Week</SelectItem>
                <SelectItem value="30">Last Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadPrintJobs} disabled={loading}>
              Refresh
            </Button>
            
            {canDelete && (
              <Button 
                variant="destructive" 
                onClick={clearAllJobs} 
                disabled={loading || jobs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>

          {/* Results Summary */}
          <div className="text-sm text-muted-foreground mb-4">
            Showing {filteredJobs.length} of {jobs.length} print jobs
          </div>

          {/* Jobs Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Workstation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Copies</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(job.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-32 truncate">
                      {job.workstation_id}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(job.status)}
                    </TableCell>
                    <TableCell>{job.copies}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{job.language}</Badge>
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-destructive">
                      {job.error}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedJob(job)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reprintJob(job)}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteJob(job.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredJobs.length === 0 && !loading && (
            <div className="text-center py-8 text-muted-foreground">
              No print jobs found matching the current filters.
            </div>
          )}

        {/* Job Details Dialog */}
        <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Print Job Details</DialogTitle>
            </DialogHeader>
            
            {selectedJob && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Job ID:</strong> {selectedJob.id}
                  </div>
                  <div>
                    <strong>Status:</strong> {getStatusBadge(selectedJob.status)}
                  </div>
                  <div>
                    <strong>Workstation:</strong> {selectedJob.workstation_id}
                  </div>
                  <div>
                    <strong>Copies:</strong> {selectedJob.copies}
                  </div>
                  <div>
                    <strong>Language:</strong> {selectedJob.language}
                  </div>
                  <div>
                    <strong>Created:</strong> {new Date(selectedJob.created_at).toLocaleString()}
                  </div>
                </div>

                {selectedJob.error && (
                  <div>
                    <strong className="text-destructive">Error:</strong>
                    <p className="text-sm text-destructive mt-1">{selectedJob.error}</p>
                  </div>
                )}

                <div>
                  <strong>TSPL Payload:</strong>
                  <pre className="mt-2 p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-64">
                    {selectedJob.payload}
                  </pre>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedJob(null)}>
                    Close
                  </Button>
                  <Button onClick={() => reprintJob(selectedJob)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reprint
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}