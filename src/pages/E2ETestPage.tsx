/**
 * E2E Test Dashboard
 * Test the full Shopify/eBay/Print workflow with synthetic data
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus,
  RefreshCw,
  ShoppingBag,
  Tag,
  Printer,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  TestTube2,
  ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useE2ETest, type TestItemWithStatus } from '@/hooks/useE2ETest';
import { useQzTray } from '@/hooks/useQzTray';
import { supabase } from '@/integrations/supabase/client';
import { buildTestItemTitle } from '@/lib/testDataGenerator';

function StatusBadge({ status }: { status: TestItemWithStatus['status'] }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    created: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    shopify_syncing: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    shopify_synced: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
    shopify_failed: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
    ebay_queued: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    ebay_processing: { variant: 'secondary', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    ebay_synced: { variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
    ebay_failed: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
    printed: { variant: 'default', icon: <Printer className="h-3 w-3" /> }
  };
  
  const { variant, icon } = config[status] || config.created;
  
  return (
    <Badge variant={variant} className="flex items-center gap-1">
      {icon}
      <span className="capitalize">{status.replace('_', ' ')}</span>
    </Badge>
  );
}

export default function E2ETestPage() {
  const {
    testItems,
    isGenerating,
    isShopifySyncing,
    isEbaySyncing,
    isPrinting,
    isCleaningUp,
    shopifyDryRun,
    ebayDryRunEnabled,
    printDryRun,
    assignedStore,
    selectedLocation,
    generateItems,
    syncToShopify,
    queueForEbay,
    processEbayQueue,
    printLabels,
    cleanupTestItems,
    deleteSelectedItems,
    loadExistingTestItems,
    checkEbayDryRun,
    toggleShopifyDryRun,
    togglePrintDryRun
  } = useE2ETest();

  const {
    isConnected: qzConnected,
    connect: connectQz,
    zebraPrinters,
    selectedPrinter,
    setSelectedPrinter,
    printZpl,
    isConnecting
  } = useQzTray();

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [defaultTemplate, setDefaultTemplate] = useState<string | null>(null);

  // Load existing test items and check eBay config on mount
  useEffect(() => {
    loadExistingTestItems();
    checkEbayDryRun();
    loadDefaultTemplate();
  }, [loadExistingTestItems, checkEbayDryRun]);

  // Warn user before leaving if test items exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (testItems.length > 0) {
        e.preventDefault();
        e.returnValue = 'You have test items that haven\'t been cleaned up. Are you sure you want to leave?';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [testItems.length]);

  // Load default label template
  const loadDefaultTemplate = async () => {
    const { data } = await supabase
      .from('label_templates')
      .select('canvas')
      .eq('is_default', true)
      .single();
    
    if (data?.canvas && typeof data.canvas === 'object') {
      const canvas = data.canvas as Record<string, unknown>;
      if (canvas.zplLabel && typeof canvas.zplLabel === 'string') {
        setDefaultTemplate(canvas.zplLabel);
      }
    }
  };

  // Toggle item selection
  const toggleSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Select all items
  const selectAll = () => {
    setSelectedItems(new Set(testItems.map(i => i.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const selectedItemIds = Array.from(selectedItems);
  const createdItems = testItems.filter(i => i.status === 'created');
  const shopifySyncedItems = testItems.filter(i => i.status === 'shopify_synced');
  const ebayQueuedItems = testItems.filter(i => i.status === 'ebay_queued');
  const ebaySyncedItems = testItems.filter(i => i.status === 'ebay_synced');
  const printedItems = testItems.filter(i => i.status === 'printed');

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto py-4 px-6">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <TestTube2 className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">E2E Test Dashboard</h1>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {createdItems.length > 0 && <Badge variant="outline">{createdItems.length} new</Badge>}
              {shopifySyncedItems.length > 0 && <Badge variant="secondary"><ShoppingBag className="h-3 w-3 mr-1" />{shopifySyncedItems.length}</Badge>}
              {ebaySyncedItems.length > 0 && <Badge variant="secondary"><Tag className="h-3 w-3 mr-1" />{ebaySyncedItems.length}</Badge>}
              {printedItems.length > 0 && <Badge><Printer className="h-3 w-3 mr-1" />{printedItems.length}</Badge>}
              <Badge variant="secondary">{testItems.length} total</Badge>
            </div>
          </div>
          <p className="text-muted-foreground mt-1 ml-14">
            Test the full Shopify/eBay/Print workflow with synthetic data
          </p>
        </div>
      </div>

      <div className="container mx-auto py-6 px-6 space-y-6">
        {/* Store/Location Info */}
        {(!assignedStore || !selectedLocation) ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Store/Location Assigned</AlertTitle>
            <AlertDescription>
              You need a store and location assignment to generate test items. Please contact your administrator.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Using: {assignedStore}</AlertTitle>
            <AlertDescription className="text-xs font-mono truncate">
              Location: {selectedLocation}
            </AlertDescription>
          </Alert>
        )}
        
        {/* Safety Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Alert variant={shopifyDryRun ? 'default' : 'destructive'}>
            <ShoppingBag className="h-4 w-4" />
            <AlertTitle>Shopify Mode</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{shopifyDryRun ? 'Dry run - simulated' : '⚠️ LIVE'}</span>
              <div className="flex items-center gap-2">
                <Label htmlFor="shopify-dry-run" className="text-xs">Dry</Label>
                <Switch id="shopify-dry-run" checked={shopifyDryRun} onCheckedChange={toggleShopifyDryRun} />
              </div>
            </AlertDescription>
          </Alert>
          
          <Alert variant={ebayDryRunEnabled ? 'default' : 'destructive'}>
            <Tag className="h-4 w-4" />
            <AlertTitle>eBay Mode</AlertTitle>
            <AlertDescription>
              {ebayDryRunEnabled ? 'Dry run - simulated' : '⚠️ LIVE MODE'}
            </AlertDescription>
          </Alert>
          
          <Alert variant={printDryRun ? 'default' : 'destructive'}>
            <Printer className="h-4 w-4" />
            <AlertTitle>Print Mode</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{printDryRun ? 'Dry run - no print' : '⚠️ LIVE'}</span>
              <div className="flex items-center gap-2">
                <Label htmlFor="print-dry-run" className="text-xs">Dry</Label>
                <Switch id="print-dry-run" checked={printDryRun} onCheckedChange={togglePrintDryRun} />
              </div>
            </AlertDescription>
          </Alert>
        </div>

        {/* Step 1: Generate Test Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">1</span>
              Generate Test Items
            </CardTitle>
            <CardDescription>Create synthetic inventory items with TEST- prefix</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <span className="text-sm text-muted-foreground self-center w-20">Graded:</span>
                <Button onClick={() => generateItems(1, { gradedOnly: true })} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  1 Graded
                </Button>
                <Button onClick={() => generateItems(3, { gradedOnly: true })} disabled={isGenerating} variant="secondary">
                  3 Graded
                </Button>
                <Button onClick={() => generateItems(5, { gradedOnly: true })} disabled={isGenerating} variant="secondary">
                  5 Graded
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-sm text-muted-foreground self-center w-20">Raw:</span>
                <Button onClick={() => generateItems(1, { rawOnly: true })} disabled={isGenerating} variant="outline">
                  {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  1 Raw
                </Button>
                <Button onClick={() => generateItems(3, { rawOnly: true })} disabled={isGenerating} variant="outline">
                  3 Raw
                </Button>
                <Button onClick={() => generateItems(5, { rawOnly: true })} disabled={isGenerating} variant="outline">
                  5 Raw
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <span className="text-sm text-muted-foreground self-center w-20">Mixed:</span>
                <Button onClick={() => generateItems(5)} disabled={isGenerating} variant="secondary">
                  5 Mixed
                </Button>
                <Button onClick={loadExistingTestItems} variant="ghost">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload
                </Button>
              </div>
            </div>
            
            {testItems.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedItems.size} of {testItems.length} selected
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={selectAll}>Select All</Button>
                    <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
                    {selectedItems.size > 0 && (
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => {
                          deleteSelectedItems(selectedItemIds);
                          clearSelection();
                        }}
                        disabled={isCleaningUp}
                      >
                        {isCleaningUp ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                        Delete ({selectedItems.size})
                      </Button>
                    )}
                  </div>
                </div>
                <ScrollArea className="h-[200px] border rounded-md">
                  <div className="p-2 space-y-2">
                    {testItems.map(item => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-accent ${
                          selectedItems.has(item.id) ? 'bg-accent' : ''
                        }`}
                        onClick={() => toggleSelection(item.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-1 rounded">{item.sku}</code>
                            <Badge variant={item.type === 'Graded' ? 'default' : 'secondary'}>
                              {item.type}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {buildTestItemTitle(item)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <span className="text-sm font-medium">${item.price.toFixed(2)}</span>
                          <StatusBadge status={item.status} />
                          {(item.status === 'shopify_failed' || item.status === 'ebay_failed') && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-destructive cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p className="text-xs">{item.shopify_sync_error || item.ebay_sync_error || 'Unknown error'}</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Sync to Shopify */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">2</span>
              Sync to Shopify
            </CardTitle>
            <CardDescription>Push test items to Shopify (respects dry run mode)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button 
                onClick={() => syncToShopify(selectedItemIds)}
                disabled={isShopifySyncing || selectedItemIds.length === 0}
              >
                {isShopifySyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingBag className="h-4 w-4 mr-2" />}
                Sync Selected ({selectedItemIds.length})
              </Button>
              <Button
                variant="secondary"
                onClick={() => syncToShopify(createdItems.map(i => i.id))}
                disabled={isShopifySyncing || createdItems.length === 0}
              >
                Sync All New ({createdItems.length})
              </Button>
            </div>
            
            {shopifySyncedItems.length > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {shopifySyncedItems.length} item(s) synced to Shopify
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Sync to eBay */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">3</span>
              Sync to eBay
            </CardTitle>
            <CardDescription>Queue and process items for eBay listing</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                onClick={() => queueForEbay(selectedItemIds)}
                disabled={selectedItemIds.length === 0}
                variant="secondary"
              >
                <Tag className="h-4 w-4 mr-2" />
                Queue Selected ({selectedItemIds.length})
              </Button>
              <Button
                onClick={processEbayQueue}
                disabled={isEbaySyncing}
              >
                {isEbaySyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Process Queue
              </Button>
            </div>
            
            {(ebayQueuedItems.length > 0 || ebaySyncedItems.length > 0) && (
              <div className="mt-4 flex items-center gap-4 text-sm">
                {ebayQueuedItems.length > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {ebayQueuedItems.length} queued
                  </span>
                )}
                {ebaySyncedItems.length > 0 && (
                  <span className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    {ebaySyncedItems.length} synced to eBay
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Print Labels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm">4</span>
              Print Labels
            </CardTitle>
            <CardDescription>Generate and print labels via QZ Tray</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <span className="text-sm">Printer:</span>
                </div>
                {qzConnected ? (
                  <Select value={selectedPrinter || ''} onValueChange={setSelectedPrinter}>
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder="Select printer" />
                    </SelectTrigger>
                    <SelectContent>
                      {zebraPrinters.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button variant="outline" onClick={connectQz} disabled={isConnecting}>
                    {isConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Connect to QZ Tray
                  </Button>
                )}
                {qzConnected && <Badge variant="outline" className="text-primary">Connected</Badge>}
              </div>
              
              <Separator />
              
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    if (selectedPrinter && defaultTemplate) {
                      printLabels(selectedItemIds, selectedPrinter, printZpl, defaultTemplate);
                    }
                  }}
                  disabled={isPrinting || !qzConnected || !selectedPrinter || !defaultTemplate || selectedItemIds.length === 0}
                >
                  {isPrinting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
                  Print Selected ({selectedItemIds.length})
                </Button>
              </div>
              
              {printedItems.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  {printedItems.length} label(s) printed
                </div>
              )}
              
              {!defaultTemplate && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No default label template found. Please set a default template in Label Settings.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cleanup */}
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Cleanup
            </CardTitle>
            <CardDescription>Permanently delete all TEST-* items from database</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently delete all {testItems.length} test item(s) and their related queue entries.
              </AlertDescription>
            </Alert>
            <Button
              variant="destructive"
              onClick={cleanupTestItems}
              disabled={isCleaningUp || testItems.length === 0}
            >
              {isCleaningUp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete All Test Items
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
    </TooltipProvider>
  );
}
