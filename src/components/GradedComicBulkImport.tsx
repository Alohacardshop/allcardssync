import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileText, Download, Hash } from "lucide-react";
import { useIntakeValidation } from "@/hooks/useIntakeValidation";
import { useStore } from "@/contexts/StoreContext";
import { normalizePSAData } from "@/lib/psaNormalization";
import { useLogger } from "@/hooks/useLogger";
import { useAddIntakeItem } from "@/hooks/useAddIntakeItem";

interface ComicImportItem {
  certNumber: string;
  price?: number;
  cost?: number;
  gradingService: 'psa' | 'cgc';
  status: 'pending' | 'processing' | 'looking_up' | 'adding' | 'success' | 'error';
  error?: string;
  data?: {
    title?: string;
    issueNumber?: string;
    publisher?: string;
    year?: string;
    publicationDate?: string;
    grade?: string;
    language?: string;
    country?: string;
    pageQuality?: string;
    varietyPedigree?: string;
    imageUrl?: string;
    imageUrls?: string[];
    source?: string;
    rawSnapshot?: any;
  };
}

export const GradedComicBulkImport = () => {
  const [items, setItems] = useState<ComicImportItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [manualInput, setManualInput] = useState('');
  const [gradingService, setGradingService] = useState<'psa' | 'cgc'>('psa');
  const [defaultPrice, setDefaultPrice] = useState('');
  const [defaultCost, setDefaultCost] = useState('');

  const { assignedStore, selectedLocation } = useIntakeValidation();
  const { availableLocations } = useStore();
  const { mutateAsync: addItem } = useAddIntakeItem();
  const logger = useLogger('GradedComicBulkImport');

  // Auto-calc cost at 70% of price
  const handlePriceChange = (val: string) => {
    setDefaultPrice(val);
    if (val && !isNaN(parseFloat(val))) {
      setDefaultCost((parseFloat(val) * 0.7).toFixed(2));
    }
  };

  const sanitizeCert = (input: string): string => {
    return input.replace(/\D+/g, '').slice(0, 12);
  };

  const parseInput = (text: string): ComicImportItem[] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines
      .map(line => {
        // Support CSV: "certNumber,price" or just "certNumber"
        const parts = line.trim().replace(/['"]/g, '').split(/[,\t]/);
        const cert = sanitizeCert(parts[0]?.trim() || '');
        const priceVal = parts[1]?.trim() ? parseFloat(parts[1].trim()) : undefined;
        const costVal = parts[2]?.trim() ? parseFloat(parts[2].trim()) : undefined;
        return {
          certNumber: cert,
          price: priceVal && !isNaN(priceVal) ? priceVal : undefined,
          cost: costVal && !isNaN(costVal) ? costVal : undefined,
          gradingService,
          status: 'pending' as const,
        };
      })
      .filter(item => {
        if (item.certNumber.length < 6) return false;
        // Skip header row
        if (/cert/i.test(item.certNumber)) return false;
        return true;
      });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseInput(text);
      setItems(parsed);
      toast.success(`Loaded ${parsed.length} certificate numbers`);
    };
    reader.readAsText(file);
  };

  const handleManualInput = () => {
    if (!manualInput.trim()) {
      toast.error("Please enter certificate numbers");
      return;
    }
    const parsed = parseInput(manualInput);
    setItems(parsed);
    toast.success(`Added ${parsed.length} certificate numbers`);
    setManualInput('');
  };

  const lookupCert = async (certNumber: string, service: 'psa' | 'cgc'): Promise<ComicImportItem['data']> => {
    if (service === 'psa') {
      const { data, error } = await supabase.functions.invoke('psa-lookup', {
        body: { cert_number: certNumber }
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || 'PSA lookup failed');

      const psa = normalizePSAData(data.data);
      return {
        title: psa.subject || '',
        issueNumber: psa.issueNumber || psa.cardNumber || '',
        publisher: psa.brandTitle || '',
        year: psa.year || '',
        publicationDate: psa.publicationDate || '',
        grade: psa.grade || '',
        language: psa.language || '',
        country: psa.country || '',
        pageQuality: psa.pageQuality || '',
        varietyPedigree: psa.varietyPedigree || '',
        imageUrl: psa.imageUrls?.[0],
        imageUrls: psa.imageUrls,
        source: 'psa',
        rawSnapshot: psa,
      };
    } else {
      const { data, error } = await supabase.functions.invoke('cgc-lookup', {
        body: { certNumber }
      });
      if (error) throw new Error(error.message);
      if (!data?.ok || !data?.data?.isValid) throw new Error(data?.error || 'CGC lookup failed');

      const cgc = data.data;
      return {
        title: cgc.title || '',
        issueNumber: cgc.issueNumber || '',
        publisher: cgc.publisher || cgc.seriesName || '',
        year: cgc.year?.toString() || '',
        grade: cgc.grade || '',
        varietyPedigree: cgc.variety || '',
        imageUrl: cgc.images?.front,
        imageUrls: [cgc.images?.front, cgc.images?.rear].filter(Boolean),
        source: 'cgc',
        rawSnapshot: cgc,
      };
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
    const locValid = availableLocations.some(l => l.gid === selectedLocation);
    if (!locValid) {
      toast.error("Selected location doesn't belong to the selected store");
      return;
    }

    const fallbackPrice = parseFloat(defaultPrice);
    const fallbackCost = parseFloat(defaultCost);
    
    // Check that every item has a price (either per-item or default)
    const missingPrice = items.some(i => !i.price && (!fallbackPrice || fallbackPrice <= 0));
    if (missingPrice) {
      toast.error("Please set a default price or include prices in your CSV");
      return;
    }

    setImporting(true);
    setProgress(0);

    const updated = [...items];
    let processed = 0;

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];

      try {
        // Step 1: Lookup
        updated[i] = { ...item, status: 'looking_up' };
        setItems([...updated]);

        const lookupData = await lookupCert(item.certNumber, item.gradingService);
        updated[i] = { ...updated[i], data: lookupData };
        setItems([...updated]);

        // Step 2: Add to batch
        updated[i] = { ...updated[i], status: 'adding' };
        setItems([...updated]);

        const gradingCompanyUpper = item.gradingService.toUpperCase();
        const variant = lookupData?.varietyPedigree || '';
        const yearValue = lookupData?.publicationDate || lookupData?.year || null;

        const catalogSnapshot = item.gradingService === 'psa'
          ? {
              ...lookupData?.rawSnapshot,
              psa_cert: item.certNumber,
              grading_company: 'PSA',
              type: 'psa_comic',
              year: lookupData?.year,
              publicationDate: lookupData?.publicationDate,
              language: lookupData?.language,
              country: lookupData?.country,
              pageQuality: lookupData?.pageQuality,
            }
          : {
              ...lookupData?.rawSnapshot,
              cgc_cert: item.certNumber,
              grading_company: 'CGC',
              type: 'cgc_comic',
              year: lookupData?.year,
            };

        const itemPrice = item.price || fallbackPrice;
        const itemCost = item.cost || (item.price ? +(item.price * 0.7).toFixed(2) : fallbackCost) || null;

        await addItem({
          store_key_in: assignedStore,
          shopify_location_gid_in: selectedLocation,
          quantity_in: 1,
          grade_in: lookupData?.grade || '',
          brand_title_in: lookupData?.publisher || '',
          subject_in: lookupData?.title || '',
          category_in: lookupData?.publisher || 'Comics',
          variant_in: variant,
          card_number_in: lookupData?.issueNumber || '',
          price_in: itemPrice,
          cost_in: itemCost,
          sku_in: item.certNumber,
          main_category_in: 'comics',
          sub_category_in: 'graded_comics',
          year_in: yearValue,
          grading_company_in: gradingCompanyUpper,
          catalog_snapshot_in: catalogSnapshot,
          source_provider_in: `${item.gradingService}_bulk`,
          processing_notes_in: 'Bulk graded comic import',
        });

        updated[i] = { ...updated[i], status: 'success' };
      } catch (error: any) {
        logger.logError(`Error processing cert ${item.certNumber}`, error);
        updated[i] = {
          ...updated[i],
          status: 'error',
          error: error.message || 'Unknown error',
        };
      }

      processed++;
      setProgress((processed / updated.length) * 100);
      setItems([...updated]);

      // Delay between items to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    setImporting(false);
    const successful = updated.filter(i => i.status === 'success').length;
    const failed = updated.filter(i => i.status === 'error').length;
    toast.success(`Import complete: ${successful} added, ${failed} failed`);
  };

  const downloadTemplate = () => {
    const template = "Certificate Number,Price,Cost\n12345678,29.99,20.99\n87654321,49.99,34.99\n11111111,19.99,13.99";
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graded_comic_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (status: ComicImportItem['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-muted text-muted-foreground',
      looking_up: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      adding: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };
    const labels: Record<string, string> = {
      pending: 'Pending',
      looking_up: 'Looking up…',
      processing: 'Processing…',
      adding: 'Adding…',
      success: 'Success',
      error: 'Error',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || ''}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Grading Service Selector */}
      <div className="space-y-2">
        <Label>Grading Service</Label>
        <RadioGroup
          value={gradingService}
          onValueChange={(v: 'psa' | 'cgc') => setGradingService(v)}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="psa" id="bulk-psa" />
            <Label htmlFor="bulk-psa" className="cursor-pointer font-normal">PSA</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="cgc" id="bulk-cgc" />
            <Label htmlFor="bulk-cgc" className="cursor-pointer font-normal">CGC</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Default Price/Cost */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Default Price (fallback if not in CSV)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="Fallback price"
            value={defaultPrice}
            onChange={(e) => handlePriceChange(e.target.value)}
            disabled={importing}
          />
          <p className="text-xs text-muted-foreground mt-1">Per-item prices in CSV take priority</p>
          />
        </div>
        <div>
          <Label>Default Cost (70% auto)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="Cost"
            value={defaultCost}
            onChange={(e) => setDefaultCost(e.target.value)}
            disabled={importing}
          />
        </div>
      </div>

      {/* Input Methods */}
      <Tabs defaultValue="manual" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="file">Upload CSV</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <div className="space-y-2">
            <Label>Certificate Numbers (one per line)</Label>
            <Textarea
              placeholder={`Enter ${gradingService.toUpperCase()} cert numbers, one per line\n12345678\n87654321`}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              disabled={importing}
              rows={6}
            />
          </div>
          <Button
            onClick={handleManualInput}
            disabled={importing || !manualInput.trim()}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Hash className="h-4 w-4" />
            Load Certificates
          </Button>
        </TabsContent>

        <TabsContent value="file" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Upload CSV File</Label>
              <Input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                disabled={importing}
              />
              <p className="text-sm text-muted-foreground mt-1">
                One certificate number per line
              </p>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Template
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action Bar */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {items.length} certificates loaded ({gradingService.toUpperCase()})
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setItems([])}
                disabled={importing}
              >
                Clear
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !defaultPrice}
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

      {/* Results Table */}
      {items.length > 0 && (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cert #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono text-sm">{item.certNumber}</TableCell>
                  <TableCell>{statusBadge(item.status)}</TableCell>
                  <TableCell>
                    {item.data?.imageUrl ? (
                      <img
                        src={item.data.imageUrl}
                        alt="Cover"
                        className="w-10 h-14 object-cover rounded border"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : '-'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.data?.title || '-'}</TableCell>
                  <TableCell>{item.data?.grade || '-'}</TableCell>
                  <TableCell>{item.data?.publisher || '-'}</TableCell>
                  <TableCell className="text-destructive text-sm max-w-[200px] truncate">
                    {item.error || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
