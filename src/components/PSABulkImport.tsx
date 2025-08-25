import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download } from "lucide-react";

interface PSAImportItem {
  psaCert: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
  data?: {
    title?: string;
    year?: string;
    grade?: string;
    brandTitle?: string;
    subject?: string;
    category?: string;
  };
}

export const PSABulkImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<PSAImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      parseCSV(uploadedFile);
    }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      const parsedItems: PSAImportItem[] = lines.map(line => {
        const cert = line.trim().replace(/['"]/g, ''); // Remove quotes
        return {
          psaCert: cert,
          status: 'pending' as const
        };
      }).filter(item => item.psaCert && item.psaCert.length > 0);

      setItems(parsedItems);
      toast.success(`Loaded ${parsedItems.length} PSA certificates`);
    };
    reader.readAsText(file);
  };

  const scrapePSAData = async (psaCert: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('psa-scrape', {
        body: { certificateNumber: psaCert }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('PSA scrape error:', error);
      throw error;
    }
  };

  const insertIntakeItem = async (item: PSAImportItem) => {
    const { error } = await supabase
      .from('intake_items')
      .insert({
        psa_cert: item.psaCert,
        brand_title: item.data?.brandTitle,
        subject: item.data?.subject,
        year: item.data?.year,
        grade: item.data?.grade,
        category: item.data?.category,
        price: 0 // Default price, can be updated later
      });

    if (error) throw error;
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error("No items to import");
      return;
    }

    setImporting(true);
    setProgress(0);

    const updatedItems = [...items];
    let processed = 0;

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      
      try {
        // Update status to processing
        updatedItems[i] = { ...item, status: 'processing' };
        setItems([...updatedItems]);

        // Scrape PSA data
        const psaData = await scrapePSAData(item.psaCert);
        
        if (psaData && !psaData.error) {
          // Update with scraped data
          updatedItems[i] = {
            ...item,
            data: {
              title: psaData.title,
              year: psaData.year,
              grade: psaData.grade,
              brandTitle: psaData.brandTitle || psaData.setName,
              subject: psaData.subject,
              category: psaData.category
            }
          };

          // Insert into database
          await insertIntakeItem(updatedItems[i]);
          
          updatedItems[i] = { ...updatedItems[i], status: 'success' };
        } else {
          throw new Error(psaData?.error || 'Failed to scrape PSA data');
        }
      } catch (error) {
        console.error(`Error processing ${item.psaCert}:`, error);
        updatedItems[i] = {
          ...item,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      processed++;
      setProgress((processed / updatedItems.length) * 100);
      setItems([...updatedItems]);

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setImporting(false);
    
    const successful = updatedItems.filter(item => item.status === 'success').length;
    const failed = updatedItems.filter(item => item.status === 'error').length;
    
    toast.success(`Import completed: ${successful} successful, ${failed} failed`);
  };

  const downloadTemplate = () => {
    const template = "PSA Certificate Number\n12345678\n87654321\n11111111";
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'psa_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            PSA Certificate Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="psa-csv">Upload CSV File</Label>
              <Input
                id="psa-csv"
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                disabled={importing}
              />
              <p className="text-sm text-muted-foreground mt-1">
                Upload a CSV file with one PSA certificate number per line
              </p>
            </div>
            <Button
              variant="outline"
              onClick={downloadTemplate}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Template
            </Button>
          </div>

          {items.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {items.length} certificates loaded
                </p>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? 'Importing...' : 'Start Import'}
                </Button>
              </div>

              {importing && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-sm text-center text-muted-foreground">
                    {Math.round(progress)}% complete
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Import Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PSA Certificate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono">{item.psaCert}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'success' ? 'bg-green-100 text-green-800' :
                        item.status === 'error' ? 'bg-red-100 text-red-800' :
                        item.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>{item.data?.title || '-'}</TableCell>
                    <TableCell>{item.data?.grade || '-'}</TableCell>
                    <TableCell className="text-red-600 text-sm">{item.error || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};