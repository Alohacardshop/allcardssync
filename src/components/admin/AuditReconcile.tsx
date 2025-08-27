import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { runAudit, fixSet, type GameMode, type AuditResult } from '@/lib/api';

interface AuditReconcileProps {
  selectedMode: GameMode;
}

const AuditReconcile: React.FC<AuditReconcileProps> = ({ selectedMode }) => {
  const [setId, setSetId] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [fixingItems, setFixingItems] = useState<Set<string>>(new Set());

  const handleRunAudit = async () => {
    setIsAuditing(true);
    try {
      const result = await runAudit(selectedMode, { setId: setId || undefined }) as AuditResult;
      setAuditResult(result);
      toast.success('Audit completed successfully');
    } catch (error: any) {
      console.error('Audit failed:', error);
      toast.error('Audit failed', { description: error.message });
    } finally {
      setIsAuditing(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const csvData = await runAudit(selectedMode, { 
        setId: setId || undefined, 
        exportFormat: 'csv' 
      }) as string;
      
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-${selectedMode.value}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('CSV exported successfully');
    } catch (error: any) {
      console.error('Export failed:', error);
      toast.error('Export failed', { description: error.message });
    }
  };

  const handleFixSet = async (setIdToFix: string) => {
    setFixingItems(prev => new Set(prev).add(setIdToFix));
    try {
      await fixSet(selectedMode, setIdToFix);
      toast.success(`Set ${setIdToFix} sync queued`);
      
      // Re-run audit to show updated counts
      setTimeout(() => {
        handleRunAudit();
      }, 1000);
    } catch (error: any) {
      console.error('Fix failed:', error);
      toast.error('Fix failed', { description: error.message });
    } finally {
      setFixingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(setIdToFix);
        return newSet;
      });
    }
  };

  const isDisabled = isAuditing;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="setId">Set ID (optional)</Label>
              <Input
                id="setId"
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                placeholder="Leave empty to audit all sets"
                disabled={isDisabled}
              />
            </div>
            <Button
              onClick={handleRunAudit}
              disabled={isDisabled}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isAuditing ? 'animate-spin' : ''}`} />
              Run Audit
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={isDisabled || !auditResult}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {auditResult && auditResult.totals && (
        <>
          {/* Summary Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{auditResult.totals.sets_upstream || 0}</div>
                <p className="text-xs text-muted-foreground">Sets Upstream</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{auditResult.totals.sets_local || 0}</div>
                <p className="text-xs text-muted-foreground">Sets Local</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-destructive">{auditResult.totals.sets_missing || 0}</div>
                <p className="text-xs text-muted-foreground">Sets Missing</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-amber-600">{auditResult.totals.variants_stale || 0}</div>
                <p className="text-xs text-muted-foreground">Variants Stale</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{auditResult.totals.cards_upstream || 0}</div>
                <p className="text-xs text-muted-foreground">Cards Upstream</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{auditResult.totals.cards_local || 0}</div>
                <p className="text-xs text-muted-foreground">Cards Local</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary">{auditResult.totals.variants_upstream || 0}</div>
                <p className="text-xs text-muted-foreground">Variants Upstream</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{auditResult.totals.variants_local || 0}</div>
                <p className="text-xs text-muted-foreground">Variants Local</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-destructive">{auditResult.totals.variants_missing || 0}</div>
                <p className="text-xs text-muted-foreground">Variants Missing</p>
              </CardContent>
            </Card>
          </div>

          {/* Missing Sets */}
          {auditResult.sampleMissing?.sets?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Missing Sets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Set ID</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditResult.sampleMissing.sets.map((setId) => (
                      <TableRow key={setId}>
                        <TableCell className="font-mono text-sm">{setId}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => handleFixSet(setId)}
                            disabled={fixingItems.has(setId)}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className={`h-3 w-3 ${fixingItems.has(setId) ? 'animate-spin' : ''}`} />
                            Fix
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Next Actions */}
          {auditResult.nextActions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Recommended Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {auditResult.nextActions.map((action, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Badge variant="outline">{index + 1}</Badge>
                      <span className="text-sm">{action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Perfect State */}
          {auditResult.totals?.sets_missing === 0 && 
           auditResult.totals?.cards_missing === 0 && 
           auditResult.totals?.variants_missing === 0 && 
           auditResult.totals?.variants_stale === 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Audit Complete - No Issues Found</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  Your {selectedMode.label} data is fully synchronized with upstream.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!auditResult && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Run an audit to compare your local data with upstream sources.</p>
              <p className="text-sm mt-2">This will identify missing or stale data that needs synchronization.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AuditReconcile;