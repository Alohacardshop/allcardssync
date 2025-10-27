import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { tcgSupabase, getCachedPricingViaDB, updateVariantPricing, PricingResponse } from "@/integrations/supabase/client";
import { logger } from '@/lib/logger';

export function TCGHealthCheck() {
  const [cardId, setCardId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectivity, setConnectivity] = useState<'unknown' | 'success' | 'error'>('unknown');
  const [dbResult, setDbResult] = useState<PricingResponse | null>(null);
  const [refreshResult, setRefreshResult] = useState<PricingResponse | null>(null);

  const testConnectivity = async () => {
    setLoading(true);
    try {
      const { data, error } = await tcgSupabase
        .from('games')
        .select('id, name')
        .limit(1);

      if (error) {
        setConnectivity('error');
        logger.error('TCG DB connectivity test failed', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-health-check');
      } else {
        setConnectivity('success');
        logger.info('TCG DB connectivity test passed', { dataCount: data?.length || 0 }, 'tcg-health-check');
      }
    } catch (error) {
      setConnectivity('error');
      logger.error('TCG DB connectivity error', error instanceof Error ? error : new Error(String(error)), {}, 'tcg-health-check');
    } finally {
      setLoading(false);
    }
  };

  const handleDbRead = async () => {
    if (!cardId.trim()) return;
    
    setLoading(true);
    try {
      const result = await getCachedPricingViaDB(
        cardId.trim(),
        'near_mint',
        'normal',
        variantId.trim() || undefined
      );
      setDbResult(result);
      
      // Log telemetry
      logger.info('DB pricing read', {
        event: 'db_pricing_read',
        cardId: cardId.trim(),
        variantId: variantId.trim() || undefined,
        outcome: result.success ? 'success' : 'error',
        variants_found: result.variants?.length || 0
      }, 'tcg-health-check');
    } catch (error) {
      logger.error('DB read error', error instanceof Error ? error : new Error(String(error)), { cardId }, 'tcg-health-check');
      setDbResult({
        success: false,
        cardId: cardId.trim(),
        refreshed: false,
        variants: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!cardId.trim()) return;
    
    setLoading(true);
    try {
      const result = await updateVariantPricing(
        cardId.trim(),
        'near_mint',
        'normal',
        variantId.trim() || undefined
      );
      setRefreshResult(result);
      
      // Log telemetry
      logger.info('Manual pricing refresh', {
        event: 'manual_pricing_refresh',
        cardId: cardId.trim(),
        variantId: variantId.trim() || undefined,
        condition: 'near_mint',
        printing: 'normal',
        outcome: result.success ? 'success' : 'error',
        variants_updated: result.variants?.length || 0
      }, 'tcg-health-check');
    } catch (error) {
      logger.error('Pricing refresh error', error instanceof Error ? error : new Error(String(error)), { cardId }, 'tcg-health-check');
      setRefreshResult({
        success: false,
        cardId: cardId.trim(),
        refreshed: true,
        variants: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const formatResult = (result: PricingResponse) => {
    return {
      success: result.success,
      cardId: result.cardId,
      error: result.error,
      variants_count: result.variants?.length || 0,
      variants: result.variants?.slice(0, 2).map(v => ({
        id: v.id,
        condition: v.condition,
        printing: v.printing,
        market_price_cents: v.pricing?.market_price_cents || v.market_price_cents
      }))
    };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>TCG Database Health Check</span>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testConnectivity}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
            </Button>
            {connectivity === 'success' && <CheckCircle className="h-5 w-5 text-green-600" />}
            {connectivity === 'error' && <XCircle className="h-5 w-5 text-red-600" />}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cardId">Card ID</Label>
            <Input
              id="cardId"
              placeholder="Enter card UUID"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="variantId">Variant ID (optional)</Label>
            <Input
              id="variantId"
              placeholder="Enter variant UUID"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleDbRead}
            disabled={!cardId.trim() || loading}
            variant="outline"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            DB Read
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={!cardId.trim() || loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Refresh
          </Button>
        </div>

        {dbResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={dbResult.success ? "default" : "destructive"}>
                DB Read {dbResult.success ? "Success" : "Failed"}
              </Badge>
              {dbResult.variants && (
                <Badge variant="secondary">
                  {dbResult.variants.length} variants
                </Badge>
              )}
            </div>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-32">
              {JSON.stringify(formatResult(dbResult), null, 2)}
            </pre>
          </div>
        )}

        {refreshResult && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={refreshResult.success ? "default" : "destructive"}>
                Refresh {refreshResult.success ? "Success" : "Failed"}
              </Badge>
              {refreshResult.variants && (
                <Badge variant="secondary">
                  {refreshResult.variants.length} variants
                </Badge>
              )}
            </div>
            <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-32">
              {JSON.stringify(formatResult(refreshResult), null, 2)}
            </pre>
          </div>
        )}

        <div className="pt-4 border-t space-y-2">
          <h4 className="font-medium">Project Configuration</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-muted-foreground">TCG Database</div>
              <div className="font-mono">dhyvufggodqkcjbrjhxk.supabase.co</div>
            </div>
            <div>
              <div className="font-medium text-muted-foreground">App Database</div>
              <div className="font-mono">dmpoandoydaqxhzdjnmk.supabase.co</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}