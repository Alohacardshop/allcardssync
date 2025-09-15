import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Calendar as CalendarIcon, FileText, Database } from 'lucide-react';
import { format } from 'date-fns';

interface DataExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ExportOptions {
  tables: string[];
  format: 'csv' | 'json';
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  includeDeleted: boolean;
}

const AVAILABLE_TABLES = [
  { id: 'intake_items', name: 'Inventory Items', description: 'All inventory and intake items' },
  { id: 'intake_lots', name: 'Batches', description: 'Processing batches' },
  { id: 'shopify_sync_queue', name: 'Sync Queue', description: 'Shopify synchronization status' },
  { id: 'system_logs', name: 'System Logs', description: 'Application logs and events' },
  { id: 'psa_certificates', name: 'PSA Certificates', description: 'PSA grading certificates' },
  { id: 'print_jobs', name: 'Print Jobs', description: 'Label printing history' }
];

export function DataExportDialog({ open, onOpenChange }: DataExportDialogProps) {
  const [options, setOptions] = useState<ExportOptions>({
    tables: ['intake_items'],
    format: 'csv',
    dateRange: { from: null, to: null },
    includeDeleted: false
  });
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showDateRange, setShowDateRange] = useState(false);

  const handleTableToggle = (tableId: string, checked: boolean) => {
    setOptions(prev => ({
      ...prev,
      tables: checked 
        ? [...prev.tables, tableId]
        : prev.tables.filter(t => t !== tableId)
    }));
  };

  const exportData = async () => {
    if (options.tables.length === 0) {
      toast.error('Please select at least one table to export');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const exportData: any = {};
      const totalTables = options.tables.length;

      for (let i = 0; i < options.tables.length; i++) {
        const tableId = options.tables[i];
        setExportProgress(((i + 1) / totalTables) * 100);

        let query = supabase.from(tableId as any).select('*');

        // Apply date filter if specified
        if (options.dateRange.from && options.dateRange.to) {
          query = query
            .gte('created_at', options.dateRange.from.toISOString())
            .lte('created_at', options.dateRange.to.toISOString());
        }

        // Filter out deleted items unless specifically requested
        if (!options.includeDeleted && tableId === 'intake_items') {
          query = query.is('deleted_at', null);
        }

        const { data, error } = await query;
        
        if (error) {
          console.error(`Export error for ${tableId}:`, error);
          toast.error(`Failed to export ${tableId}: ${error.message}`);
          continue;
        }

        exportData[tableId] = data || [];
      }

      // Generate export file
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      
      if (options.format === 'csv') {
        // Export as separate CSV files in a zip would be ideal,
        // but for simplicity, export the largest table as CSV
        const primaryTable = options.tables.includes('intake_items') ? 'intake_items' : options.tables[0];
        const csvData = convertToCSV(exportData[primaryTable] || []);
        downloadFile(csvData, `${primaryTable}_export_${timestamp}.csv`, 'text/csv');
      } else {
        // Export as JSON
        const jsonData = JSON.stringify(exportData, null, 2);
        downloadFile(jsonData, `data_export_${timestamp}.json`, 'application/json');
      }

      toast.success(`Data exported successfully (${Object.keys(exportData).length} tables)`);
      onOpenChange(false);

    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again or contact support.');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape values containing commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        }).join(',')
      )
    ];
    
    return csvRows.join('\n');
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Export Data
          </DialogTitle>
          <DialogDescription>
            Export system data for backup, analysis, or migration purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Table Selection */}
          <div>
            <h4 className="font-medium mb-3">Select Tables to Export</h4>
            <div className="grid grid-cols-1 gap-3">
              {AVAILABLE_TABLES.map(table => (
                <div key={table.id} className="flex items-start space-x-3">
                  <Checkbox
                    id={table.id}
                    checked={options.tables.includes(table.id)}
                    onCheckedChange={(checked) => handleTableToggle(table.id, Boolean(checked))}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor={table.id}
                      className="text-sm font-medium cursor-pointer"
                    >
                      {table.name}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {table.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <h4 className="font-medium mb-3">Export Format</h4>
            <Select value={options.format} onValueChange={(value) => setOptions(prev => ({ ...prev, format: value as any }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV (Comma Separated Values)</SelectItem>
                <SelectItem value="json">JSON (JavaScript Object Notation)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Checkbox
                id="date-range"
                checked={showDateRange}
                onCheckedChange={(checked) => setShowDateRange(Boolean(checked))}
              />
              <label htmlFor="date-range" className="font-medium cursor-pointer">
                Filter by Date Range
              </label>
            </div>
            
            {showDateRange && (
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {options.dateRange.from ? format(options.dateRange.from, 'PP') : 'From date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={options.dateRange.from}
                      onSelect={(date) => setOptions(prev => ({ 
                        ...prev, 
                        dateRange: { ...prev.dateRange, from: date }
                      }))}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {options.dateRange.to ? format(options.dateRange.to, 'PP') : 'To date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={options.dateRange.to}
                      onSelect={(date) => setOptions(prev => ({ 
                        ...prev, 
                        dateRange: { ...prev.dateRange, to: date }
                      }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Additional Options */}
          <div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-deleted"
                checked={options.includeDeleted}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeDeleted: Boolean(checked) }))}
              />
              <label htmlFor="include-deleted" className="text-sm font-medium cursor-pointer">
                Include deleted/soft-deleted items
              </label>
            </div>
          </div>

          {/* Progress */}
          {isExporting && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Exporting data...</span>
                <span className="text-sm text-muted-foreground">{Math.round(exportProgress)}%</span>
              </div>
              <Progress value={exportProgress} className="w-full" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={exportData} disabled={isExporting || options.tables.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            {isExporting ? 'Exporting...' : 'Export Data'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}