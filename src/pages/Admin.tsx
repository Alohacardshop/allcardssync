import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "@/components/Navigation";
import { Database, Settings, Users, BarChart3, CheckCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cleanupAuthState } from "@/lib/auth";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { SystemStats } from "@/components/SystemStats";
import CatalogTab from "@/components/admin/CatalogTab";
import TCGDatabaseSettings from "@/components/admin/TCGDatabaseSettings";
import { UserAssignmentManager } from "@/components/UserAssignmentManager";
import { checkSystemHealth } from "@/lib/api";

const Admin = () => {
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
      window.location.href = '/auth';
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
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
          <div className="flex items-center space-x-2">
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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="shopify-inspect">Inspect Shopify</TabsTrigger>
          </TabsList>

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
            <CatalogTab />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <TCGDatabaseSettings />
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <SystemHealthCard />
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
                  <a 
                    href="/shopify-inspect" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-primary hover:underline"
                  >
                    Open Shopify Inspector
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;