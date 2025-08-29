import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import CatalogResetRebuild from './CatalogResetRebuild';
import ProviderSyncButton from './ProviderSyncButton';
import GameScopedCatalogSync from './GameScopedCatalogSync';
import PokemonCatalogSync from './PokemonCatalogSync';
import PokemonOneTimeBackfill from './PokemonOneTimeBackfill';
import PokemonSyncErrors from './PokemonSyncErrors';
import CardsView from './CardsView';
import SetsList from './SetsList';
import SystemHealthCard from './SystemHealthCard';

interface LogMessage {
  type: string;
  timestamp: string;
  level?: 'info' | 'success' | 'error' | 'warning';
  message?: string;
  game?: string;
  phase?: string;
  count?: number;
  total?: number;
  error?: string;
  sets?: number;
  cards?: number;
  variants?: number;
}

const CatalogTab = () => {
  const [logs, setLogs] = useState<LogMessage[]>([]);

  const handleLogsUpdate = (newLogs: LogMessage[]) => {
    setLogs(newLogs);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Catalog Management</h2>
        <p className="text-muted-foreground">
          Manage catalog data synchronization, rebuilds, and monitoring
        </p>
      </div>

      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync">Sync & Operations</TabsTrigger>
          <TabsTrigger value="browse">Browse Data</TabsTrigger>
          <TabsTrigger value="legacy">Legacy Tools</TabsTrigger>
          <TabsTrigger value="health">Health & Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-6">
          {/* New Provider Sync */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Sync (JustTCG)</CardTitle>
              <CardDescription>
                Stream catalog data directly from JustTCG API with real-time progress tracking.
                This is the recommended way to sync catalog data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProviderSyncButton 
                onLogsUpdate={handleLogsUpdate}
                disabled={false}
              />
            </CardContent>
          </Card>

          <Separator />

          {/* Existing Rebuild */}
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone — Reset & Rebuild</CardTitle>
              <CardDescription>
                Complete catalog rebuild using shadow tables and atomic swap.
                This clears all data and rebuilds from scratch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CatalogResetRebuild onLogsUpdate={handleLogsUpdate} />
            </CardContent>
          </Card>

          {/* Unified Log Viewer */}
          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Operation Logs</CardTitle>
                <CardDescription>
                  Real-time logs from sync and rebuild operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded border text-sm font-mono ${
                        log.type === 'ERROR' || log.level === 'error'
                          ? 'bg-destructive/10 border-destructive text-destructive'
                          : log.type === 'COMPLETE' || log.level === 'success'
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : log.level === 'warning'
                          ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <span className="flex-1">
                          {log.message || `${log.type}${log.game ? ` (${log.game})` : ''}`}
                        </span>
                        <span className="text-xs opacity-60 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {log.error && log.error !== log.message && (
                        <div className="mt-1 text-xs opacity-80">
                          Error: {log.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="browse" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <SetsList />
            <CardsView />
          </div>
        </TabsContent>

        <TabsContent value="legacy" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Legacy Sync Tools</CardTitle>
              <CardDescription>
                Older sync tools - use Provider Sync above for new operations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <GameScopedCatalogSync />
              <Separator />
              <PokemonCatalogSync />
              <Separator />
              <PokemonOneTimeBackfill />
              <Separator />
              <PokemonSyncErrors />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <SystemHealthCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CatalogTab;
