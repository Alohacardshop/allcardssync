import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "@/components/Navigation";
import { Database, Settings, Users, BarChart3, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanupAuthState } from "@/lib/auth";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { PSAScrapePingCard } from "@/components/admin/PSAScrapePingCard";
import { PSAApiSettings } from "@/components/admin/PSAApiSettings";
import { SystemStats } from "@/components/SystemStats";
import CatalogTab from "@/components/admin/CatalogTab";
import TCGDatabaseSettings from "@/components/admin/TCGDatabaseSettings";
import { UserAssignmentManager } from "@/components/UserAssignmentManager";
import { SystemLogsViewer } from "@/components/admin/SystemLogsViewer";
import { ShopifyConfig } from "@/components/admin/ShopifyConfig";
import { ShopifyTagImport } from "@/components/admin/ShopifyTagImport";
import { PricingJobsMonitor } from "@/components/admin/PricingJobsMonitor";
import { TCGHealthCheck } from "@/components/admin/TCGHealthCheck";
import { RawIntakeSettings } from "@/components/admin/RawIntakeSettings";

import { checkSystemHealth } from "@/lib/api";

const Admin = () => {
  const navigate = useNavigate();
  const [healthStatus, setHealthStatus] = useState<{database: boolean; timestamp: string; error?: string} | null>(null);

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const health = await checkSystemHealth();
        setHealthStatus(health);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Health check failed:', error);
        }
        setHealthStatus({
          database: false,
          timestamp: new Date().toISOString(),
          error: 'Health check failed'
        });
      }
    };
    loadHealth();
  }, []);

  const handleSignOut = async () => {
    try {
      cleanupAuthState();
      try { 
        await supabase.auth.signOut({ scope: 'global' } as any); 
      } catch {}
    } finally {
      navigate('/auth', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="flex h-16 items-center px-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold">Analytics Admin</h1>
          </div>
          <div className="ml-auto">
            <Navigation />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <div className="flex items-center space-x-2 flex-wrap gap-2">
            <Badge variant="secondary">Admin</Badge>
            {healthStatus?.database ? (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle className="mr-1 h-3 w-3" />
                System Online
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertTriangle className="mr-1 h-3 w-3" />
                System Issues
              </Badge>
            )}
          </div>
        </div>

        <SystemStats />

        <Tabs defaultValue="inventory" className="space-y-4">
          <div className="w-full overflow-x-auto">
            <TabsList className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-max">
              <TabsTrigger value="inventory" className="whitespace-nowrap">Inventory</TabsTrigger>
              <TabsTrigger value="catalog" className="whitespace-nowrap">Catalog</TabsTrigger>
              <TabsTrigger value="raw-intake" className="whitespace-nowrap">Raw Intake</TabsTrigger>
              <TabsTrigger value="settings" className="whitespace-nowrap">Settings</TabsTrigger>
              <TabsTrigger value="system" className="whitespace-nowrap">System</TabsTrigger>
              <TabsTrigger value="users" className="whitespace-nowrap">Users</TabsTrigger>
              <TabsTrigger value="integrations" className="whitespace-nowrap">Integrations</TabsTrigger>
              <TabsTrigger value="shopify-config" className="whitespace-nowrap">Shopify Config</TabsTrigger>
              <TabsTrigger value="shopify-import" className="whitespace-nowrap">Shopify Import</TabsTrigger>
              <TabsTrigger value="shopify-inspect" className="whitespace-nowrap">Inspect Shopify</TabsTrigger>
              <TabsTrigger value="logs" className="whitespace-nowrap">System Logs</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="inventory" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Inventory Management
                  </CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Active</div>
                  <p className="text-xs text-muted-foreground">
                    Real-time inventory tracking and analytics
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Label Printing
                  </CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Ready</div>
                  <p className="text-xs text-muted-foreground">
                    PrintNode integration active
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="catalog" className="space-y-4">
            <div className="space-y-6">
              <CatalogTab />
              <PricingJobsMonitor />
              <TCGHealthCheck />
            </div>
          </TabsContent>

          <TabsContent value="raw-intake" className="space-y-4">
            <RawIntakeSettings />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <TCGDatabaseSettings />
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <div className="space-y-6">
              <SystemHealthCard />
              <PSAApiSettings />
              <PSAScrapePingCard />
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <UserAssignmentManager />
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Shopify Integration</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="default">Connected</Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    Product sync and inventory management active
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">PrintNode</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="default">Connected</Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    Label printing service ready
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">External TCG API</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">Not Configured</Badge>
                  <p className="text-sm text-muted-foreground mt-2">
                    Ready for external TCG database connection
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="shopify-config" className="space-y-4">
            <ShopifyConfig />
          </TabsContent>

          <TabsContent value="shopify-import" className="space-y-4">
            <ShopifyTagImport />
          </TabsContent>
          
          <TabsContent value="shopify-inspect" className="space-y-4">
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Shopify Store Inspector</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Inspect Shopify store configuration and validate API connections.
                  </p>
                  <Link 
                    to="/shopify-inspect" 
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Open Shopify Inspector
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <SystemLogsViewer />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;