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
import { useStore } from "@/contexts/StoreContext";
import { v4 as uuidv4 } from 'uuid';
import { invokePSAScrapeV2 } from "@/lib/psaServiceV2";
import { normalizePSAData } from "@/lib/psaNormalization";

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
    game?: string;
    imageUrl?: string;
    imageUrls?: string[];
    source?: string;
  };
}

export const PSABulkImport = () => {
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<PSAImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { selectedStore, selectedLocation } = useStore();
  const batchId = uuidv4(); // Generate a unique batch ID for this import session

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
    return await invokePSAScrapeV2({ cert: psaCert, forceRefresh: true }, 45000); // 45s timeout
  };

  const insertIntakeItem = async (item: PSAImportItem) => {
    try {
      const rpcParams = {
        store_key_in: selectedStore || null,
        shopify_location_gid_in: selectedLocation || null,
        quantity_in: 1,
        brand_title_in: item.data?.brandTitle || '',
        subject_in: item.data?.subject || '',
        category_in: item.data?.category || '',
        variant_in: '',
        card_number_in: '',
        grade_in: item.data?.grade || '',
        price_in: 0,
        cost_in: null,
        sku_in: `PSA-${item.psaCert}`,
        source_provider_in: 'psa_bulk',
        catalog_snapshot_in: item.data,
        pricing_snapshot_in: {
          price: 0,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `PSA bulk import from ${file?.name}`
      };

      const response: any = await supabase.rpc('create_raw_intake_item', rpcParams);
      if (response.error) throw response.error;
    } catch (error: any) {
      console.error('PSA bulk import error:', error);
      throw error;
    }
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error("No items to import");
      return;
    }

    if (!selectedStore || !selectedLocation) {
      toast.error("Please select a store and location before importing");
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
        
        if (psaData && psaData.ok) {
          // Normalize the PSA data to handle older cert formats
          const normalizedData = normalizePSAData(psaData);
          
          // Update with normalized data
          updatedItems[i] = {
            ...item,
            data: {
              title: normalizedData.brandTitle || normalizedData.subject,
              year: normalizedData.year,
              grade: normalizedData.grade,
              brandTitle: normalizedData.brandTitle,
              subject: normalizedData.subject,
              category: normalizedData.category,
              game: normalizedData.gameSport,
              imageUrl: normalizedData.imageUrl,
              imageUrls: normalizedData.imageUrls || [],
              source: normalizedData.source
            }
          };

          // Insert into database
          await insertIntakeItem(updatedItems[i]);
          
          updatedItems[i] = { ...updatedItems[i], status: 'success' };
          
          // Show per-item success toast
          toast.success(`${item.psaCert}: Fetched via web scraping`);
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
    
    toast.success(`Import completed: ${successful} imported via web scraping, ${failed} failed`);
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
                  {importing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Start Import
                    </>
                  )}
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
                  <TableHead>Image</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Source</TableHead>
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
                    <TableCell>
                      {item.data?.imageUrl ? (
                        <img 
                          src={item.data.imageUrl} 
                          alt="PSA Card"
                          className="w-12 h-16 object-cover rounded border"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : '-'}
                    </TableCell>
                    <TableCell>{item.data?.title || '-'}</TableCell>
                    <TableCell>{item.data?.grade || '-'}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                        {item.data?.source || 'scrape'}
                      </span>
                    </TableCell>
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