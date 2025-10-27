import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  Printer,
  CheckSquare,
  Square,
  AlertCircle,
  Check
} from 'lucide-react';
import { toast } from 'sonner';

interface ExportColumn {
  key: string;
  label: string;
  required?: boolean;
}

interface ExportFormat {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
  extensions: string[];
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any[];
  filename?: string;
  columns: ExportColumn[];
  title?: string;
}

const exportFormats: ExportFormat[] = [
  {
    id: 'csv',
    label: 'CSV',
    icon: FileText,
    description: 'Comma-separated values for spreadsheet apps',
    extensions: ['.csv']
  },
  {
    id: 'excel',
    label: 'Excel',
    icon: FileSpreadsheet,
    description: 'Microsoft Excel workbook with formatting',
    extensions: ['.xlsx']
  },
  {
    id: 'pdf',
    label: 'PDF',
    icon: FileText,
    description: 'Printable document format',
    extensions: ['.pdf']
  },
  {
    id: 'print',
    label: 'Print',
    icon: Printer,
    description: 'Send directly to printer',
    extensions: []
  }
];

export function ExportDialog({
  open,
  onOpenChange,
  data,
  filename = 'export',
  columns,
  title = 'Export Data'
}: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState<string>('csv');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    new Set(columns.filter(col => col.required).map(col => col.key))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);

  const requiredColumns = columns.filter(col => col.required);
  const optionalColumns = columns.filter(col => !col.required);
  const selectedCount = selectedColumns.size;
  const totalItems = data.length;

  const toggleColumn = (columnKey: string) => {
    const column = columns.find(col => col.key === columnKey);
    if (column?.required) return; // Can't deselect required columns

    setSelectedColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      return newSet;
    });
  };

  const selectAllColumns = () => {
    setSelectedColumns(new Set(columns.map(col => col.key)));
  };

  const selectOnlyRequired = () => {
    setSelectedColumns(new Set(requiredColumns.map(col => col.key)));
  };

  const handleExport = async () => {
    if (selectedColumns.size === 0) {
      toast.error('Please select at least one column to export');
      return;
    }

    setIsExporting(true);
    setExportComplete(false);

    try {
      // Prepare export data
      const exportData = data.map(item => {
        const exportItem: Record<string, any> = {};
        selectedColumns.forEach(columnKey => {
          exportItem[columnKey] = item[columnKey] || '';
        });
        return exportItem;
      });

      // Trigger actual export based on format
      await performExport(selectedFormat, exportData);

      setExportComplete(true);
      toast.success(`Successfully exported ${totalItems} items`);

    } catch (error) {
      toast.error('Failed to export data');
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        if (exportComplete) {
          onOpenChange(false);
          setExportComplete(false);
        }
      }, 500);
    }
  };

  const performExport = async (format: string, exportData: any[]) => {
    switch (format) {
      case 'csv':
        await exportToCsv(exportData);
        break;
      case 'excel':
        await exportToExcel(exportData);
        break;
      case 'pdf':
        await exportToPdf(exportData);
        break;
      case 'print':
        await sendToPrint(exportData);
        break;
    }
  };

  const exportToCsv = async (data: any[]) => {
    if (data.length === 0) return;

    const headers = Array.from(selectedColumns).map(key => 
      columns.find(col => col.key === key)?.label || key
    );
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        Array.from(selectedColumns).map(key => {
          const value = row[key] || '';
          return typeof value === 'string' && value.includes(',') 
            ? `"${value.replace(/"/g, '""')}"` 
            : value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  };

  const exportToExcel = async (data: any[]) => {
    // This would typically use a library like xlsx
    toast.info('Excel export would require additional library');
    await exportToCsv(data); // Fallback to CSV
  };

  const exportToPdf = async (data: any[]) => {
    // This would typically use a library like jsPDF
    toast.info('PDF export would require additional library');
    await exportToCsv(data); // Fallback to CSV
  };

  const sendToPrint = async (data: any[]) => {
    // Create a printable table
    const headers = Array.from(selectedColumns).map(key => 
      columns.find(col => col.key === key)?.label || key
    );

    const printContent = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            @page { margin: 1in; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${data.map(row => 
                `<tr>${Array.from(selectedColumns).map(key => 
                  `<td>${escapeHtml(String(row[key] || ''))}</td>`
                ).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Helper function to escape HTML to prevent XSS
  const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Download className="mr-2 h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Format Selection */}
          <div>
            <Label className="text-base font-medium">Export Format</Label>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {exportFormats.map(format => (
                <Button
                  key={format.id}
                  variant={selectedFormat === format.id ? 'default' : 'outline'}
                  className="h-auto p-3 justify-start"
                  onClick={() => setSelectedFormat(format.id)}
                >
                  <format.icon className="mr-2 h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium">{format.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {format.description}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Column Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-medium">
                Select Columns ({selectedCount} of {columns.length})
              </Label>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAllColumns}
                  disabled={isExporting}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectOnlyRequired}
                  disabled={isExporting}
                >
                  Required Only
                </Button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto border rounded-lg p-3">
              {requiredColumns.length > 0 && (
                <>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Required Columns
                  </div>
                  {requiredColumns.map(column => (
                    <div key={column.key} className="flex items-center space-x-2 py-1">
                      <CheckSquare className="h-4 w-4 text-primary" />
                      <Label className="flex-1">{column.label}</Label>
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    </div>
                  ))}
                </>
              )}

              {optionalColumns.length > 0 && (
                <>
                  {requiredColumns.length > 0 && <Separator className="my-3" />}
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Optional Columns
                  </div>
                  {optionalColumns.map(column => (
                    <div key={column.key} className="flex items-center space-x-2 py-1">
                      <button
                        onClick={() => toggleColumn(column.key)}
                        disabled={isExporting}
                        className="flex items-center"
                      >
                        {selectedColumns.has(column.key) ? (
                          <CheckSquare className="h-4 w-4 text-primary" />
                        ) : (
                          <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <Label 
                        className="flex-1 cursor-pointer"
                        onClick={() => toggleColumn(column.key)}
                      >
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Export Summary */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {exportComplete ? (
                `Successfully exported ${totalItems} items!`
              ) : (
                `Ready to export ${totalItems} items with ${selectedCount} columns in ${
                  exportFormats.find(f => f.id === selectedFormat)?.label
                } format.`
              )}
            </AlertDescription>
          </Alert>

          {/* Progress */}
          {isExporting && (
            <div className="flex items-center justify-center gap-2 py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="text-sm text-muted-foreground">Preparing export...</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={isExporting || selectedColumns.size === 0}
              className="min-w-24"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Exporting...
                </>
              ) : exportComplete ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Complete
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}