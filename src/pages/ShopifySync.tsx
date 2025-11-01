/**
 * Shopify Sync page with idempotent retry functionality
 */

import React from 'react';
import { Navigation } from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Upload, AlertTriangle } from 'lucide-react';
import { ShopifyRetryPanel } from '@/components/ShopifyRetryPanel';
import { SystemHealthCard } from '@/components/SystemHealthCard';
import { RealTimeSyncMonitor } from '@/components/shopify/RealTimeSyncMonitor';

export default function ShopifySync() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Shopify Sync</h1>
            </div>
            <Navigation />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* System Health Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SystemHealthCard />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Sync Overview
                </CardTitle>
                <CardDescription>
                  Manage and monitor Shopify product synchronization with safe, idempotent operations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Deterministic handles & SKUs prevent duplicates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span>Existence checks before every operation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span>Automatic retry with exponential backoff</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span>Success marking only after confirmation</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Sync Interface */}
          <Tabs defaultValue="retry" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="retry" className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Retry Failed
              </TabsTrigger>
              <TabsTrigger value="monitor" className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Monitor
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="retry" className="mt-6">
              <ShopifyRetryPanel />
            </TabsContent>

            <TabsContent value="monitor" className="mt-6">
              <RealTimeSyncMonitor />
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sync Settings</CardTitle>
                  <CardDescription>
                    Configure Shopify sync behavior, retry limits, and safety settings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    Sync settings configuration coming soon...
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}