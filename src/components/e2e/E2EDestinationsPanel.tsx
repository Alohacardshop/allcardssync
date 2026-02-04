/**
 * Right panel - marketplace destinations (Shopify, eBay, Print)
 */

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Tag, Printer, AlertTriangle, Loader2 } from 'lucide-react';
import { E2EDestinationCard } from './E2EDestinationCard';
import type { TestItemWithStatus, TestItemStatus } from '@/hooks/useE2ETest';

interface E2EDestinationsPanelProps {
  testItems: TestItemWithStatus[];
  selectedItemIds: string[];
  // Shopify
  shopifyDryRun: boolean;
  onShopifyDryRunChange: () => void;
  isShopifySyncing: boolean;
  onSyncToShopify: (ids: string[]) => void;
  // eBay
  ebayDryRunEnabled: boolean;
  isEbaySyncing: boolean;
  onQueueForEbay: (ids: string[]) => void;
  onProcessEbayQueue: () => void;
  // Print
  printDryRun: boolean;
  onPrintDryRunChange: () => void;
  isPrinting: boolean;
  qzConnected: boolean;
  isConnecting: boolean;
  onConnectQz: () => void;
  zebraPrinters: string[];
  selectedPrinter: string | null;
  onSelectPrinter: (printer: string) => void;
  hasDefaultTemplate: boolean;
  onPrint: (ids: string[]) => void;
}

export function E2EDestinationsPanel({
  testItems,
  selectedItemIds,
  shopifyDryRun,
  onShopifyDryRunChange,
  isShopifySyncing,
  onSyncToShopify,
  ebayDryRunEnabled,
  isEbaySyncing,
  onQueueForEbay,
  onProcessEbayQueue,
  printDryRun,
  onPrintDryRunChange,
  isPrinting,
  qzConnected,
  isConnecting,
  onConnectQz,
  zebraPrinters,
  selectedPrinter,
  onSelectPrinter,
  hasDefaultTemplate,
  onPrint
}: E2EDestinationsPanelProps) {
  // Compute stats
  const countByStatus = (statuses: TestItemStatus[]) => 
    testItems.filter(i => statuses.includes(i.status)).length;

  const createdCount = countByStatus(['created']);
  const shopifySyncedCount = countByStatus(['shopify_synced', 'ebay_queued', 'ebay_processing', 'ebay_synced', 'printed']);
  const shopifyFailedCount = countByStatus(['shopify_failed']);
  const ebayQueuedCount = countByStatus(['ebay_queued', 'ebay_processing']);
  const ebaySyncedCount = countByStatus(['ebay_synced', 'printed']);
  const ebayFailedCount = countByStatus(['ebay_failed']);
  const printedCount = testItems.filter(i => i.printed_at).length;

  const selectedCount = selectedItemIds.length;

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold">Destinations</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sync selected items to platforms
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Shopify Card */}
        <E2EDestinationCard
          title="Shopify"
          icon={<ShoppingBag className="h-4 w-4" />}
          dryRun={shopifyDryRun}
          onDryRunChange={onShopifyDryRunChange}
          stats={[
            ...(shopifySyncedCount > 0 ? [{ label: 'synced', count: shopifySyncedCount, variant: 'success' as const }] : []),
            ...(shopifyFailedCount > 0 ? [{ label: 'failed', count: shopifyFailedCount, variant: 'error' as const }] : []),
            ...(createdCount > 0 ? [{ label: 'new', count: createdCount, variant: 'default' as const }] : [])
          ]}
          actions={[
            {
              label: `Sync Selected (${selectedCount})`,
              onClick: () => onSyncToShopify(selectedItemIds),
              disabled: isShopifySyncing || selectedCount === 0,
              loading: isShopifySyncing,
              variant: 'default'
            },
            {
              label: `Sync All New (${createdCount})`,
              onClick: () => onSyncToShopify(testItems.filter(i => i.status === 'created').map(i => i.id)),
              disabled: isShopifySyncing || createdCount === 0,
              variant: 'secondary'
            }
          ]}
        />

        {/* eBay Card */}
        <E2EDestinationCard
          title="eBay"
          icon={<Tag className="h-4 w-4" />}
          dryRun={ebayDryRunEnabled}
          dryRunReadOnly
          stats={[
            ...(ebaySyncedCount > 0 ? [{ label: 'synced', count: ebaySyncedCount, variant: 'success' as const }] : []),
            ...(ebayQueuedCount > 0 ? [{ label: 'queued', count: ebayQueuedCount, variant: 'warning' as const }] : []),
            ...(ebayFailedCount > 0 ? [{ label: 'failed', count: ebayFailedCount, variant: 'error' as const }] : [])
          ]}
          actions={[
            {
              label: `Queue Selected (${selectedCount})`,
              onClick: () => onQueueForEbay(selectedItemIds),
              disabled: selectedCount === 0,
              variant: 'secondary'
            },
            {
              label: 'Process Queue',
              onClick: onProcessEbayQueue,
              disabled: isEbaySyncing,
              loading: isEbaySyncing,
              variant: 'default'
            }
          ]}
        />

        {/* Print Card */}
        <E2EDestinationCard
          title="Print"
          icon={<Printer className="h-4 w-4" />}
          dryRun={printDryRun}
          onDryRunChange={onPrintDryRunChange}
          stats={[
            ...(printedCount > 0 ? [{ label: 'printed', count: printedCount, variant: 'success' as const }] : [])
          ]}
          actions={[
            {
              label: `Print Selected (${selectedCount})`,
              onClick: () => onPrint(selectedItemIds),
              disabled: isPrinting || !qzConnected || !selectedPrinter || !hasDefaultTemplate || selectedCount === 0,
              loading: isPrinting,
              variant: 'default'
            }
          ]}
          footer={
            <div className="space-y-2">
              {/* Printer connection */}
              <div className="flex items-center gap-2 flex-wrap">
                {qzConnected ? (
                  <>
                    <Badge variant="secondary" className="text-xs">
                      Connected
                    </Badge>
                    <Select value={selectedPrinter || ''} onValueChange={onSelectPrinter}>
                      <SelectTrigger className="h-8 text-xs flex-1 min-w-[150px]">
                        <SelectValue placeholder="Select printer" />
                      </SelectTrigger>
                      <SelectContent>
                        {zebraPrinters.map(p => (
                          <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={onConnectQz} 
                    disabled={isConnecting}
                    className="h-8 text-xs"
                  >
                    {isConnecting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Connect to QZ Tray
                  </Button>
                )}
              </div>

              {/* Template warning */}
              {!hasDefaultTemplate && (
                <Alert className="py-2">
                  <AlertTriangle className="h-3 w-3" />
                  <AlertDescription className="text-xs">
                    No default label template configured.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
