import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Zap, 
  RefreshCw, 
  AlertTriangle, 
  ChevronDown,
  HelpCircle,
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';

interface ShopifyForceSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeKey: string;
  locationGid: string;
  selectedItems?: string[];
  onComplete?: () => void;
}

export function ShopifyForceSyncDialog({ 
  open, 
  onOpenChange, 
  storeKey, 
  locationGid, 
  selectedItems = [],
  onComplete 
}: ShopifyForceSyncDialogProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  
  // Advanced options
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    willCreate: number;
    willUpdate: number;
    willDelete: number;
  } | null>(null);

  const handleSyncClick = () => {
    // Show confirmation dialog for live sync
    setShowConfirm(true);
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync-dry-run', {
        body: {
          storeKey,
          locationGid,
          itemIds: selectedItems
        }
      });

      if (error) throw error;

      const items = data.items || [];
      setPreviewResult({
        willCreate: items.filter((item: { estimatedChanges: { willCreate: boolean } }) => item.estimatedChanges.willCreate).length,
        willUpdate: items.filter((item: { estimatedChanges: { willUpdate: boolean } }) => item.estimatedChanges.willUpdate).length,
        willDelete: items.filter((item: { estimatedChanges: { willDelete: boolean } }) => item.estimatedChanges.willDelete).length
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Preview failed';
      toast.error(`Preview failed: ${errorMessage}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeForceSync = async () => {
    setShowConfirm(false);
    setLoading(true);
    setProgress(0);

    try {
      const { error } = await supabase.functions.invoke('shopify-force-sync', {
        body: {
          storeKey,
          locationGid,
          itemIds: selectedItems,
          force: true
        }
      });

      if (error) throw error;

      toast.success(`Sync initiated for ${selectedItems.length} items`);
      onComplete?.();
      onOpenChange(false);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Force sync failed';
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const highRiskCount = selectedItems.length >= 10;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              Sync to Shopify
            </DialogTitle>
            <DialogDescription>
              Push {selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} to Shopify inventory
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Warning */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 dark:bg-orange-950/20 dark:border-orange-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 dark:text-orange-400" />
                <div>
                  <h4 className="font-medium text-orange-800 dark:text-orange-200">Live Sync Warning</h4>
                  <p className="text-sm text-orange-700 mt-1 dark:text-orange-300">
                    This will push changes immediately to Shopify. 
                    Existing Shopify data may be overwritten.
                  </p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Items to sync</span>
                  <Badge variant="secondary" className="text-lg px-3">
                    {selectedItems.length}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Progress */}
            {loading && progress > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Syncing to Shopify...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Advanced Options - Collapsible */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  Diagnostics
                  <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                <div className="p-3 rounded-lg border bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">Preview Changes</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p>Analyze what would happen without making changes. For debugging only.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={runPreview}
                      disabled={previewLoading}
                    >
                      {previewLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-1" />
                          Preview
                        </>
                      )}
                    </Button>
                  </div>

                  {previewResult && (
                    <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <div className="font-bold text-green-600">{previewResult.willCreate}</div>
                        <div className="text-xs text-muted-foreground">Create</div>
                      </div>
                      <div>
                        <div className="font-bold text-blue-600">{previewResult.willUpdate}</div>
                        <div className="text-xs text-muted-foreground">Update</div>
                      </div>
                      <div>
                        <div className="font-bold text-red-600">{previewResult.willDelete}</div>
                        <div className="text-xs text-muted-foreground">Delete</div>
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSyncClick}
              disabled={loading || selectedItems.length === 0}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={executeForceSync}
        title="Confirm Shopify Sync"
        description={`You are about to push ${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''} to Shopify. This will overwrite existing data and cannot be undone.`}
        confirmLabel="Sync Now"
        requireTypedConfirmation={highRiskCount ? "CONFIRM" : undefined}
        loading={loading}
      />
    </>
  );
}
