import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, SkipForward, Trash2, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { usePrintQueue } from '@/hooks/usePrintQueue';

interface PrintJob {
  id: string;
  status: string;
  data: any;
  target: any;
  template_id: string | null;
  copies: number;
  created_at: string;
  claimed_at: string | null;
  printed_at: string | null;
  error: string | null;
  workstation_id: string;
}

export default function PrintQueuePanel() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { queueStatus, processQueue, clearQueue } = usePrintQueue();

  useEffect(() => {
    fetchJobs();
    
    const channel = supabase
      .channel('print_jobs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => {
        fetchJobs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter, searchTerm]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('print_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        query = query.or(`data->>sku.ilike.%${searchTerm}%,data->>title.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setJobs(data || []);
    } catch (error) {
      console.error('Failed to fetch print jobs:', error);
      toast.error('Failed to load print queue');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('print_jobs')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
      toast.success('Job deleted');
      fetchJobs();
    } catch (error) {
      console.error('Failed to delete job:', error);
      toast.error('Failed to delete job');
    }
  };

  const handleClearQueue = async () => {
    if (confirm('Clear all completed jobs from the queue?')) {
      await clearQueue();
      fetchJobs();
    }
  };


  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      queued: 'secondary',
      claimed: 'default',
      processing: 'default',
      completed: 'default',
      error: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by SKU or title..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={fetchJobs} variant="outline" size="icon">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button onClick={handleClearQueue} variant="outline">
          Clear Completed
        </Button>
      </div>


      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Queue Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold">{queueStatus.queueLength}</div>
                <div className="text-xs text-muted-foreground">Queued</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{queueStatus.totalProcessed}</div>
                <div className="text-xs text-muted-foreground">Processed</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{queueStatus.totalErrors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {queueStatus.isProcessing ? 'Active' : 'Idle'}
                </div>
                <div className="text-xs text-muted-foreground">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">Loading...</div>
            </CardContent>
          </Card>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">No jobs found</div>
            </CardContent>
          </Card>
        ) : (
          jobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(job.status)}
                      <span className="font-medium">{job.data?.sku || 'No SKU'}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {job.data?.title || job.data?.brand_title || 'No title'}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Copies: {job.copies}</span>
                      {job.template_id && <span>Template: {job.template_id}</span>}
                      <span>Created: {new Date(job.created_at).toLocaleString()}</span>
                    </div>
                    {job.error && (
                      <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                        Error: {job.error}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {job.status === 'queued' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => processQueue()}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteJob(job.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
