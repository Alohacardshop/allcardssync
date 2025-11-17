import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download, Hash } from "lucide-react";
import { useStore } from "@/contexts/StoreContext";
import { v4 as uuidv4 } from 'uuid';
// PSA service removed - using direct API integration
import { normalizePSAData } from "@/lib/psaNormalization";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SubCategoryCombobox } from "@/components/ui/sub-category-combobox";
import { detectMainCategory } from "@/utils/categoryMapping";
import { logger } from "@/lib/logger";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

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
  const [manualInput, setManualInput] = useState('');
  const { assignedStore, selectedLocation, availableLocations } = useStore();
  const { mutateAsync: addItem } = useAddIntakeItem();
  const batchId = uuidv4(); // Generate a unique batch ID for this import session
  const [mainCategory, setMainCategory] = useState('tcg');
  const [subCategory, setSubCategory] = useState('');

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
      }).filter(item => {
        if (!item.psaCert || item.psaCert.length === 0) return false;
        // Validate 8-9 digit certificate numbers
        if (!/^\d{8,9}$/.test(item.psaCert)) {
          logger.warn(`Invalid PSA cert format: ${item.psaCert} (must be 8-9 digits)`, { cert: item.psaCert }, 'psa-bulk-import');
          return false;
        }
        return true;
      });

      setItems(parsedItems);
      toast.success(`Loaded ${parsedItems.length} PSA certificates`);
    };
    reader.readAsText(file);
  };

  const handleManualInput = () => {
    if (!manualInput.trim()) {
      toast.error("Please enter PSA certificate numbers");
      return;
    }

    const lines = manualInput.split('\n').filter(line => line.trim());
    const parsedItems: PSAImportItem[] = lines.map(line => {
      const cert = line.trim().replace(/['"]/g, ''); // Remove quotes
      return {
        psaCert: cert,
        status: 'pending' as const
      };
    }).filter(item => {
      if (!item.psaCert || item.psaCert.length === 0) return false;
      // Validate 8-9 digit certificate numbers
      if (!/^\d{8,9}$/.test(item.psaCert)) {
        logger.warn(`Invalid PSA cert format: ${item.psaCert} (must be 8-9 digits)`, { cert: item.psaCert }, 'psa-bulk-import');
        return false;
      }
      return true;
    });

    setItems(parsedItems);
    toast.success(`Added ${parsedItems.length} PSA certificates`);
    setManualInput('');
  };

  const scrapePSAData = async (psaCert: string) => {
    // NOTE: PSA API integration required
    // See: https://www.psacard.com/services/PSACertVerification
    // or explore alternative data sources for PSA cert lookup
    throw new Error("PSA lookup functionality not implemented - awaiting API integration");
  };

  const insertIntakeItem = async (item: PSAImportItem) => {
    try {
      const itemPayload = {
        store_key_in: assignedStore || null,
        shopify_location_gid_in: selectedLocation || null,
        quantity_in: 1,
        brand_title_in: item.data?.brandTitle || '',
        subject_in: item.data?.subject || '',
        category_in: subCategory || item.data?.category || '',
        variant_in: '',
        card_number_in: '',
        grade_in: item.data?.grade || '',
        price_in: 0,
        cost_in: null,
        sku_in: item.psaCert, // Use cert number directly as SKU
        source_provider_in: 'psa_bulk',
        main_category_in: mainCategory,
        sub_category_in: subCategory,
        catalog_snapshot_in: item.data,
        pricing_snapshot_in: {
          price: 0,
          captured_at: new Date().toISOString()
        },
        processing_notes_in: `PSA bulk import from ${file?.name}`
      };

      await addItem(itemPayload);
    } catch (error: any) {
      logger.error('PSA bulk import error', error instanceof Error ? error : new Error(String(error)), { cert: item.psaCert }, 'psa-bulk-import');
      throw error;
    }
  };

  const handleImport = async () => {
    if (items.length === 0) {
      toast.error("No items to import");
      return;
    }

    if (!assignedStore || !selectedLocation) {
      toast.error("Please select a store and location before importing");
      return;
    }

    // Ensure location belongs to the selected store
    const locValid = availableLocations.some(l => l.gid === selectedLocation);
    if (!locValid) {
      toast.error("Selected location doesn't belong to the selected store. Please reselect.");
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

        // PSA functionality has been removed - skip processing
        throw new Error("PSA lookup functionality removed - please implement direct API integration");
      } catch (error) {
        logger.error(`Error processing PSA cert`, error instanceof Error ? error : new Error(String(error)), { cert: item.psaCert }, 'psa-bulk-import');
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
          <div>
            <Label htmlFor="mainCategory">Main Category</Label>
            <Select value={mainCategory} onValueChange={setMainCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tcg">🎴 TCG</SelectItem>
                <SelectItem value="comics">📚 Comics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="subCategory">Sub-Category</Label>
            <SubCategoryCombobox
              mainCategory={mainCategory}
              value={subCategory}
              onChange={(value, mainCategoryId) => {
                setSubCategory(value);
                if (mainCategoryId) {
                  setMainCategory(mainCategoryId);
                }
              }}
            />
          </div>

          <Tabs defaultValue="file" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">Upload File</TabsTrigger>
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            </TabsList>
            
            <TabsContent value="file" className="space-y-4">
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
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-certs">Enter PSA Certificate Numbers</Label>
                <Textarea
                  id="manual-certs"
                  placeholder="Enter one PSA certificate number per line (up to 20 at a time)&#10;12345678&#10;87654321&#10;11111111"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  disabled={importing}
                  rows={8}
                />
                <p className="text-sm text-muted-foreground">
                  Enter one PSA certificate number per line. Recommended: 20 certificates at a time for optimal processing.
                </p>
              </div>
              <Button
                onClick={handleManualInput}
                disabled={importing || !manualInput.trim()}
                className="flex items-center gap-2"
              >
                <Hash className="h-4 w-4" />
                Add Certificates
              </Button>
            </TabsContent>
          </Tabs>

          {items.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {items.length} certificates loaded
                </p>
                <Button
                  onClick={handleImport}
                  disabled={importing || !subCategory}
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