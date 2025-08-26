import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Database,
  PlayCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FUNCTIONS_BASE = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1`;

interface GameOption {
  value: string;
  label: string;
  gameParam: string;
  filterJapanese?: boolean;
}

const GAME_OPTIONS: GameOption[] = [
  {
    value: 'mtg',
    label: 'Magic: The Gathering (MTG)',
    gameParam: 'mtg'
  },
  {
    value: 'pokemon_japan',
    label: 'Pokémon (pokemon) — Japanese only',
    gameParam: 'pokemon',
    filterJapanese: true
  }
];

interface AuditTotals {
  sets_upstream: number;
  sets_local: number;
  sets_missing: number;
  cards_upstream: number;
  cards_local: number;
  cards_missing: number;
  variants_upstream: number;
  variants_local: number;
  variants_missing: number;
  variants_stale: number;
}

interface AuditResult {
  game: string;
  scope: string;
  filterJapanese: boolean;
  totals: AuditTotals;
  sampleMissing: {
    sets: string[];
    cards: string[];
    variants: string[];
  };
  nextActions: string[];
}

export default function AuditReconcile() {
  const { toast } = useToast();
  const [selectedGame, setSelectedGame] = useState<string>('');
  const [setId, setSetId] = useState('');
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [fixingItems, setFixingItems] = useState<Set<string>>(new Set());

  const selectedGameOption = GAME_OPTIONS.find(g => g.value === selectedGame);

  const runAudit = async () => {
    if (!selectedGameOption) {
      toast({
        title: "Error",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    setAuditing(true);
    setAuditResult(null);
    
    try {
      const url = new URL(`${FUNCTIONS_BASE}/catalog-audit`);
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          game: selectedGameOption.gameParam,
          setId: setId || undefined,
          filterJapanese: selectedGameOption.filterJapanese || false,
          export: 'json'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setAuditResult(data);
        const totalMissing = data.totals.sets_missing + data.totals.cards_missing + data.totals.variants_missing;
        toast({
          title: "Audit Complete",
          description: `Found ${totalMissing} missing items and ${data.totals.variants_stale} stale variants`,
        });
      } else {
        toast({
          title: "Audit Failed",
          description: data.error || 'Unknown error occurred',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAuditing(false);
    }
  };

  const downloadAuditCsv = async () => {
    if (!selectedGameOption) {
      toast({
        title: "Error",
        description: "Please select a game first",
        variant: "destructive",
      });
      return;
    }

    try {
      const url = new URL(`${FUNCTIONS_BASE}/catalog-audit`);
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          game: selectedGameOption.gameParam,
          setId: setId || undefined,
          filterJapanese: selectedGameOption.filterJapanese || false,
          export: 'csv'
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'catalog-audit.csv';
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        toast({
          title: "Success",
          description: "Audit CSV downloaded successfully",
        });
      } else {
        const data = await response.json();
        toast({
          title: "Download Failed",
          description: data.error || 'Unknown error occurred',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fixSet = async (targetSetId: string) => {
    if (!selectedGameOption) return;

    setFixingItems(prev => new Set(prev).add(targetSetId));
    
    try {
      const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
      url.searchParams.set('game', selectedGameOption.gameParam);
      url.searchParams.set('setId', targetSetId);
      
      if (selectedGameOption.filterJapanese) {
        url.searchParams.set('filterJapanese', 'true');
      }

      const response = await fetch(url.toString(), { method: 'POST' });
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Fix Applied",
          description: `Successfully synced set ${targetSetId}`,
        });
        
        // Re-run audit to update results
        setTimeout(() => {
          runAudit();
        }, 1000);
      } else {
        toast({
          title: "Fix Failed",
          description: data.error || 'Unknown error occurred',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setFixingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(targetSetId);
        return newSet;
      });
    }
  };

  const isDisabled = auditing;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Audit & Reconcile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Game Selection */}
        <div className="space-y-2">
          <Label htmlFor="game-select">Select Game</Label>
          <Select value={selectedGame} onValueChange={setSelectedGame} disabled={isDisabled}>
            <SelectTrigger id="game-select">
              <SelectValue placeholder="Choose a game to audit..." />
            </SelectTrigger>
            <SelectContent>
              {GAME_OPTIONS.map((game) => (
                <SelectItem key={game.value} value={game.value}>
                  {game.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Optional Set ID */}
        <div className="space-y-2">
          <Label htmlFor="set-id">Set ID (optional - audit single set)</Label>
          <Input
            id="set-id"
            placeholder="e.g. sv6pt5 or unfinity"
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            disabled={isDisabled}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runAudit}
            disabled={isDisabled || !selectedGame}
            className="flex items-center gap-2"
          >
            {auditing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Run Audit
          </Button>

          {auditResult && (
            <Button
              variant="outline"
              onClick={downloadAuditCsv}
              disabled={isDisabled}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>

        {/* Audit Results */}
        {auditResult && (
          <div className="space-y-6 border-t pt-6">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Audit Results</Label>
              <Badge variant={auditResult.totals.sets_missing + auditResult.totals.cards_missing + auditResult.totals.variants_missing > 0 ? "destructive" : "default"}>
                {auditResult.scope === 'all' ? 'Full Catalog' : `Set: ${setId}`}
              </Badge>
            </div>
            
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{auditResult.totals.sets_upstream}</div>
                <div className="text-xs text-muted-foreground">Upstream Sets</div>
                <div className="text-sm text-red-600">{auditResult.totals.sets_missing} missing</div>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{auditResult.totals.cards_upstream}</div>
                <div className="text-xs text-muted-foreground">Upstream Cards</div>
                <div className="text-sm text-red-600">{auditResult.totals.cards_missing} missing</div>
              </div>
              <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{auditResult.totals.variants_upstream}</div>
                <div className="text-xs text-muted-foreground">Upstream Variants</div>
                <div className="text-sm text-red-600">{auditResult.totals.variants_missing} missing</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{auditResult.totals.variants_stale}</div>
                <div className="text-xs text-muted-foreground">Stale Variants</div>
              </div>
            </div>

            {/* Missing Sets Table */}
            {auditResult.sampleMissing.sets.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">Missing Sets</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Set ID</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.sampleMissing.sets.map((setIdMissing) => (
                      <TableRow key={setIdMissing}>
                        <TableCell className="font-mono">{setIdMissing}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fixSet(setIdMissing)}
                            disabled={fixingItems.has(setIdMissing)}
                            className="flex items-center gap-1"
                          >
                            {fixingItems.has(setIdMissing) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PlayCircle className="h-3 w-3" />
                            )}
                            Fix
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Sample Missing Items (non-tabular) */}
            {(auditResult.sampleMissing.cards.length > 0 || auditResult.sampleMissing.variants.length > 0) && (
              <div className="space-y-4">
                <Label className="font-medium">Sample Missing Items</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {auditResult.sampleMissing.cards.length > 0 && (
                    <div>
                      <strong>Missing Cards:</strong>
                      <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-1">
                        {auditResult.sampleMissing.cards.slice(0, 10).map((cardId, i) => (
                          <li key={i} className="font-mono text-xs">{cardId}</li>
                        ))}
                        {auditResult.sampleMissing.cards.length > 10 && (
                          <li className="text-muted-foreground">...and {auditResult.sampleMissing.cards.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                  {auditResult.sampleMissing.variants.length > 0 && (
                    <div>
                      <strong>Missing Variants:</strong>
                      <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-1">
                        {auditResult.sampleMissing.variants.slice(0, 10).map((variantId, i) => (
                          <li key={i} className="font-mono text-xs">{variantId}</li>
                        ))}
                        {auditResult.sampleMissing.variants.length > 10 && (
                          <li className="text-muted-foreground">...and {auditResult.sampleMissing.variants.length - 10} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Next Actions */}
            {auditResult.nextActions.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">Recommended Actions</Label>
                <div className="space-y-2">
                  {auditResult.nextActions.map((action, i) => (
                    <Alert key={i}>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>{action}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Help Text */}
        <div className="text-sm text-muted-foreground space-y-1 border-t pt-4">
          <p>
            <strong>Run Audit:</strong> Compare upstream JustTCG data with local database to find discrepancies.
          </p>
          <p>
            <strong>Export CSV:</strong> Download detailed audit report with all missing/stale items.
          </p>
          <p>
            <strong>Fix Button:</strong> Sync the specific set to resolve missing items for that set.
          </p>
          {selectedGameOption?.filterJapanese && (
            <p>
              <strong>Japanese Filter:</strong> Only Japanese language variants are included in the audit.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}