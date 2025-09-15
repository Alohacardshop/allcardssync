import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  ExternalLink 
} from 'lucide-react';

interface ConflictItem {
  itemId: string;
  sku: string;
  localData: {
    title?: string;
    price?: number;
    quantity?: number;
    lastUpdated?: string;
  };
  shopifyData: {
    productId?: string;
    variantId?: string;
    title?: string;
    price?: number;
    quantity?: number;
    lastUpdated?: string;
  };
  conflictType: 'price' | 'quantity' | 'title' | 'multiple';
  suggestions: Array<{
    action: 'use_local' | 'use_shopify' | 'manual_merge';
    description: string;
    impact: string;
  }>;
}

interface ShopifySyncConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  storeKey: string;
  onResolveConflict: (itemId: string, resolution: 'use_local' | 'use_shopify' | 'manual_merge', data?: any) => Promise<void>;
  resolving?: string[];
}

export function ShopifySyncConflictDialog({ 
  open, 
  onOpenChange, 
  conflicts, 
  storeKey,
  onResolveConflict,
  resolving = []
}: ShopifySyncConflictDialogProps) {
  
  const getConflictIcon = (type: ConflictItem['conflictType']) => {
    switch (type) {
      case 'price': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'quantity': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'title': return <AlertTriangle className="w-4 h-4 text-blue-500" />;
      case 'multiple': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <AlertTriangle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getConflictColor = (type: ConflictItem['conflictType']) => {
    switch (type) {
      case 'price': return 'border-yellow-200 bg-yellow-50';
      case 'quantity': return 'border-orange-200 bg-orange-50';
      case 'title': return 'border-blue-200 bg-blue-50';
      case 'multiple': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  const formatValue = (key: string, value: any) => {
    if (key === 'price' && typeof value === 'number') {
      return `$${value.toFixed(2)}`;
    }
    if (key === 'lastUpdated' && value) {
      return new Date(value).toLocaleString();
    }
    return value?.toString() || 'N/A';
  };

  const getShopifyUrl = (productId: string) => {
    const storeSlug = storeKey.replace('_', '-');
    return `https://admin.shopify.com/store/${storeSlug}/products/${productId}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Sync Conflicts Detected ({conflicts.length})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {conflicts.map((conflict) => (
            <Card key={conflict.itemId} className={getConflictColor(conflict.conflictType)}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getConflictIcon(conflict.conflictType)}
                    <span className="font-mono text-sm">{conflict.sku}</span>
                    <Badge variant="outline" className="capitalize">
                      {conflict.conflictType} Conflict
                    </Badge>
                  </div>
                  {conflict.shopifyData.productId && (
                    <Button variant="outline" size="sm" asChild>
                      <a 
                        href={getShopifyUrl(conflict.shopifyData.productId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View in Shopify
                      </a>
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Local Data */}
                  <Card className="border-green-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        Local System Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(conflict.localData).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                          <span className="text-sm font-mono">{formatValue(key, value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Shopify Data */}
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ExternalLink className="w-4 h-4 text-blue-500" />
                        Shopify Data
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(conflict.shopifyData).map(([key, value]) => {
                        if (key === 'productId' || key === 'variantId') return null;
                        return (
                          <div key={key} className="flex justify-between">
                            <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                            <span className="text-sm font-mono">{formatValue(key, value)}</span>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                {/* Resolution Options */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Resolution Options:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {conflict.suggestions.map((suggestion, index) => (
                      <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">
                                {suggestion.action.replace('_', ' ').toUpperCase()}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={resolving.includes(conflict.itemId)}
                                onClick={() => onResolveConflict(conflict.itemId, suggestion.action)}
                              >
                                {resolving.includes(conflict.itemId) ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ArrowRight className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                            <p className="text-xs font-medium text-orange-600">{suggestion.impact}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Bulk Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolving.includes(conflict.itemId)}
                    onClick={() => onResolveConflict(conflict.itemId, 'use_local')}
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Use Local
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolving.includes(conflict.itemId)}
                    onClick={() => onResolveConflict(conflict.itemId, 'use_shopify')}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Use Shopify
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {conflicts.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <p>No sync conflicts detected</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}