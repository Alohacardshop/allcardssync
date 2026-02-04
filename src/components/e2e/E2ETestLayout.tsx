/**
 * Main split-panel layout for E2E Test Dashboard
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ArrowLeft, TestTube2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { E2EItemsPanel } from './E2EItemsPanel';
import { E2EDestinationsPanel } from './E2EDestinationsPanel';
import { useE2ETest } from '@/hooks/useE2ETest';
import { useQzTray } from '@/hooks/useQzTray';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';

export function E2ETestLayout() {
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

  const isMobile = useIsMobile();
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

  // Selection handlers
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

  const selectAll = () => {
    setSelectedItems(new Set(testItems.map(i => i.id)));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  const selectedItemIds = Array.from(selectedItems);

  // Print handler
  const handlePrint = (ids: string[]) => {
    if (selectedPrinter && defaultTemplate) {
      printLabels(ids, selectedPrinter, printZpl, defaultTemplate);
    }
  };

  const itemsPanel = (
    <E2EItemsPanel
      testItems={testItems}
      selectedItems={selectedItems}
      onToggleSelection={toggleSelection}
      onSelectAll={selectAll}
      onClearSelection={clearSelection}
      onGenerateItems={generateItems}
      onReload={loadExistingTestItems}
      onDeleteSelected={deleteSelectedItems}
      onCleanupAll={cleanupTestItems}
      isGenerating={isGenerating}
      isCleaningUp={isCleaningUp}
    />
  );

  const destinationsPanel = (
    <E2EDestinationsPanel
      testItems={testItems}
      selectedItemIds={selectedItemIds}
      shopifyDryRun={shopifyDryRun}
      onShopifyDryRunChange={toggleShopifyDryRun}
      isShopifySyncing={isShopifySyncing}
      onSyncToShopify={syncToShopify}
      ebayDryRunEnabled={ebayDryRunEnabled}
      isEbaySyncing={isEbaySyncing}
      onQueueForEbay={queueForEbay}
      onProcessEbayQueue={processEbayQueue}
      printDryRun={printDryRun}
      onPrintDryRunChange={togglePrintDryRun}
      isPrinting={isPrinting}
      qzConnected={qzConnected}
      isConnecting={isConnecting}
      onConnectQz={connectQz}
      zebraPrinters={zebraPrinters}
      selectedPrinter={selectedPrinter}
      onSelectPrinter={setSelectedPrinter}
      hasDefaultTemplate={!!defaultTemplate}
      onPrint={handlePrint}
    />
  );

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <div className="border-b shrink-0">
          <div className="container mx-auto py-4 px-4 md:px-6">
            <div className="flex items-center gap-3">
              <Link to="/admin">
                <Button variant="ghost" size="icon" className="shrink-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-2 min-w-0">
                <TestTube2 className="h-5 w-5 text-primary shrink-0" />
                <h1 className="text-xl font-bold truncate">E2E Test Dashboard</h1>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {testItems.length} items
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Store/Location Alert */}
        <div className="container mx-auto px-4 md:px-6 py-3">
          {(!assignedStore || !selectedLocation) ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No Store/Location Assigned</AlertTitle>
              <AlertDescription>
                You need a store and location assignment to generate test items.
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
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden container mx-auto px-4 md:px-6 pb-4">
          {isMobile ? (
            // Mobile: Tabbed interface
            <Tabs defaultValue="items" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-2 mb-3">
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="destinations">Destinations</TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="flex-1 overflow-hidden border rounded-lg">
                {itemsPanel}
              </TabsContent>
              <TabsContent value="destinations" className="flex-1 overflow-hidden border rounded-lg">
                {destinationsPanel}
              </TabsContent>
            </Tabs>
          ) : (
            // Desktop: Split panel
            <ResizablePanelGroup direction="horizontal" className="h-full border rounded-lg">
              <ResizablePanel defaultSize={55} minSize={35}>
                {itemsPanel}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={45} minSize={30}>
                {destinationsPanel}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
