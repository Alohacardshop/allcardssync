import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from '@/integrations/supabase/client';
import { Settings, Database, ShoppingCart, Search, ExternalLink, RotateCcw, Loader2 } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { ShopifyConfig } from '@/components/admin/ShopifyConfig';
import TCGDatabaseSettings from '@/components/admin/TCGDatabaseSettings';
import { SystemHealthCard } from '@/components/admin/SystemHealthCard';
import { SystemLogsViewer } from '@/components/admin/SystemLogsViewer';
import { TCGHealthCheck } from '@/components/admin/TCGHealthCheck';
import { PricingJobsMonitor } from '@/components/admin/PricingJobsMonitor';
import { UserAssignmentManager } from '@/components/UserAssignmentManager';
import { RawIntakeSettings } from '@/components/admin/RawIntakeSettings';
import CatalogTab from '@/components/admin/CatalogTab';
import { InventorySyncSettings } from '@/components/admin/InventorySyncSettings';
import { ShopifyTagImport } from '@/components/admin/ShopifyTagImport';
import { PSAApiSettings } from '@/components/admin/PSAApiSettings';
import { PSAScrapePingCard } from '@/components/admin/PSAScrapePingCard';
import { CGCScrapePingCard } from '@/components/admin/CGCScrapePingCard';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';

const Admin = () => {
  const [activeTab, setActiveTab] = useState('overview');

  // Get tab from URL parameters on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, []);


  return (
    <>
      {/* Navigation Header */}
      <div className="bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="flex items-center gap-2">
                  <Home className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-lg font-semibold">Admin Dashboard</h1>
            </div>
            <Navigation showMobileMenu={true} />
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="shopify" className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Shopify
            </TabsTrigger>
            <TabsTrigger value="database" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database
            </TabsTrigger>
            <TabsTrigger value="debug" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Debug
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SystemHealthCard />
              <TCGHealthCheck />
              <PricingJobsMonitor />
              <PSAScrapePingCard />
              <CGCScrapePingCard />
            </div>
          </TabsContent>

          <TabsContent value="shopify" className="space-y-4">
            <ShopifyConfig />
            <InventorySyncSettings />
            <ShopifyTagImport />
          </TabsContent>

          <TabsContent value="database" className="space-y-4">
            <TCGDatabaseSettings />
            <RawIntakeSettings />
            <CatalogTab />
            <PSAApiSettings />
          </TabsContent>

          <TabsContent value="debug" className="space-y-4">
            <div className="text-center py-8 text-muted-foreground">
              No debug tools available
            </div>
          </TabsContent>

          <TabsContent value="users">
            <UserAssignmentManager />
          </TabsContent>

          <TabsContent value="logs">
            <SystemLogsViewer />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default Admin;