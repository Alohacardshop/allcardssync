import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  Play, 
  Eye, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  ArrowRight,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ForceSyncItem {
  id: string;
  sku: string;
  title?: string;
  quantity: number;
  price: number;
  currentShopifyStatus?: string;
  estimatedChanges: {
    willCreate: boolean;
    willUpdate: boolean;
    willDelete: boolean;
    changes: string[];
  };
  riskLevel: 'low' | 'medium' | 'high';
}

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
  
  const [dryRunResults, setDryRunResults] = useState<ForceSyncItem[]>([]);
  const [selectedForSync, setSelectedForSync] = useState<string[]>([]);
  const [phase, setPhase] = useState<'preview' | 'dryrun' | 'executing'>('preview');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const runDryRun = async () => {
    setLoading(true);
    setPhase('dryrun');
    
    try {
      const { data, error } = await supabase.functions.invoke('shopify-sync-dry-run', {
        body: {
          storeKey,
          locationGid,
          itemIds: selectedItems
        }
      });

      if (error) throw error;

      setDryRunResults(data.items || []);
      setSelectedForSync(data.items?.map((item: ForceSyncItem) => item.id) || []);
      setPhase('executing');
    } catch (error: any) {
      console.error('Dry run failed:', error);
      toast.error(`Dry run failed: ${error.message}`);
      setPhase('preview');
    } finally {
      setLoading(false);
    }
  };

  const executeForceSync = async () => {
    if (selectedForSync.length === 0) {
      toast.error('No items selected for sync');
      return;
    }

    setLoading(true);
    setProgress(0);

    try {
      const { error } = await supabase.functions.invoke('shopify-force-sync', {
        body: {
          storeKey,
          locationGid,
          itemIds: selectedForSync,
          force: true
        }
      });

      if (error) throw error;

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      // Check completion
      setTimeout(() => {
        clearInterval(progressInterval);
        setProgress(100);
        toast.success(`Force sync completed for ${selectedForSync.length} items`);
        onComplete?.();
        onOpenChange(false);
      }, 5000);

    } catch (error: any) {
      console.error('Force sync failed:', error);
      toast.error(`Force sync failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = (risk: ForceSyncItem['riskLevel']) => {
    switch (risk) {
      case 'low': return <Badge className="bg-green-100 text-green-800">Low Risk</Badge>;
      case 'medium': return <Badge className="bg-yellow-100 text-yellow-800">Medium Risk</Badge>;
      case 'high': return <Badge className="bg-red-100 text-red-800">High Risk</Badge>;
    }
  };

  const getActionIcon = (item: ForceSyncItem) => {
    if (item.estimatedChanges.willCreate) return <CheckCircle className="w-4 h-4 text-green-500" />;
    if (item.estimatedChanges.willDelete) return <XCircle className="w-4 h-4 text-red-500" />;
    if (item.estimatedChanges.willUpdate) return <RefreshCw className="w-4 h-4 text-blue-500" />;
    return <AlertTriangle className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-orange-500" />
            Force Shopify Sync
            {phase === 'executing' && (
              <Badge variant="outline" className="animate-pulse">
                {loading ? 'Processing...' : 'Ready to Execute'}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Phase Indicator */}
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${phase === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                phase === 'preview' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
              }`}>
                <Eye className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Preview</span>
            </div>
            
            <ArrowRight className="w-4 h-4 text-gray-400" />
            
            <div className={`flex items-center gap-2 ${phase === 'dryrun' ? 'text-orange-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                phase === 'dryrun' ? 'border-orange-600 bg-orange-50' : 'border-gray-300'
              }`}>
                <RefreshCw className={`w-4 h-4 ${phase === 'dryrun' && loading ? 'animate-spin' : ''}`} />
              </div>
              <span className="text-sm font-medium">Dry Run</span>
            </div>
            
            <ArrowRight className="w-4 h-4 text-gray-400" />
            
            <div className={`flex items-center gap-2 ${phase === 'executing' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                phase === 'executing' ? 'border-green-600 bg-green-50' : 'border-gray-300'
              }`}>
                <Play className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Execute</span>
            </div>
          </div>

          {phase === 'preview' && (
            <Card>
              <CardHeader>
                <CardTitle>Force Sync Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-yellow-800">Warning: Force Sync</h4>
                      <p className="text-sm text-yellow-700 mt-1">
                        Force sync will override normal conflict resolution and push changes immediately to Shopify. 
                        This operation cannot be undone and may overwrite existing Shopify data.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="text-center space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Selected {selectedItems.length} items for force sync
                  </p>
                  <Button onClick={runDryRun} disabled={loading}>
                    <Eye className="w-4 h-4 mr-2" />
                    Run Dry Run Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {phase === 'dryrun' && loading && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing changes and simulating sync operations...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {phase === 'executing' && dryRunResults.length > 0 && (
            <div className="space-y-4">
              {/* Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Dry Run Results
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedForSync(dryRunResults.map(item => item.id))}
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedForSync([])}
                      >
                        Select None
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {dryRunResults.filter(item => item.estimatedChanges.willCreate).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Will Create</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {dryRunResults.filter(item => item.estimatedChanges.willUpdate).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Will Update</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">
                        {dryRunResults.filter(item => item.estimatedChanges.willDelete).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Will Delete</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Items List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {dryRunResults.map((item) => (
                  <Card key={item.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedForSync.includes(item.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedForSync(prev => [...prev, item.id]);
                              } else {
                                setSelectedForSync(prev => prev.filter(id => id !== item.id));
                              }
                            }}
                          />
                          
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {getActionIcon(item)}
                              <span className="font-mono text-sm">{item.sku}</span>
                              {getRiskBadge(item.riskLevel)}
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                              {item.title || 'No title'} • Qty: {item.quantity} • ${item.price}
                            </div>
                            
                            {item.estimatedChanges.changes.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium">Estimated Changes:</p>
                                <ul className="text-xs text-muted-foreground space-y-0.5">
                                  {item.estimatedChanges.changes.map((change, index) => (
                                    <li key={index} className="flex items-center gap-1">
                                      <ArrowRight className="w-3 h-3" />
                                      {change}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Execution Progress */}
              {loading && progress > 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Syncing items to Shopify...</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Action Buttons */}
              <div className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setPhase('preview')}
                  disabled={loading}
                >
                  Back to Preview
                </Button>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => onOpenChange(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={executeForceSync}
                    disabled={loading || selectedForSync.length === 0}
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
                        Execute Force Sync ({selectedForSync.length})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}