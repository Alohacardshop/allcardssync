import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Database, 
  ShoppingCart, 
  Users, 
  FileText, 
  Home,
  Server,
  Shield,
  Wrench,
  BarChart3,
  Package,
  Tag,
  Download
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset
} from "@/components/ui/sidebar";
import { Navigation } from '@/components/Navigation';
import { ShopifyConfig } from '@/components/admin/ShopifyConfig';
import TCGDatabaseSettings from '@/components/admin/TCGDatabaseSettings';
import { SystemLogsViewer } from '@/components/admin/SystemLogsViewer';
import { UserAssignmentManager } from '@/components/UserAssignmentManager';
import { RawIntakeSettings } from '@/components/admin/RawIntakeSettings';
import CatalogTab from '@/components/admin/CatalogTab';
import { InventorySyncSettings } from '@/components/admin/InventorySyncSettings';
import { ShopifyTagImport } from '@/components/admin/ShopifyTagImport';
import { PSAApiSettings } from '@/components/admin/PSAApiSettings';
import ShopifySyncQueue from '@/components/admin/ShopifySyncQueue';

const Admin = () => {
  const [activeSection, setActiveSection] = useState('overview');
  const location = useLocation();

  const adminSections = [
    {
      id: 'overview',
      title: 'Overview',
      icon: BarChart3,
      description: 'System overview and quick actions',
      url: '#overview'
    },
    {
      id: 'stores',
      title: 'Store Management',
      icon: ShoppingCart,
      description: 'Shopify integration and inventory sync',
      url: '#stores'
    },
    {
      id: 'catalog',
      title: 'Catalog & Data',
      icon: Database,
      description: 'TCG database and card catalog settings',
      url: '#catalog'
    },
    {
      id: 'users',
      title: 'User Management',
      icon: Users,
      description: 'User assignments and permissions',
      url: '#users'
    },
    {
      id: 'system',
      title: 'System & Logs',
      icon: Server,
      description: 'System logs and debugging tools',
      url: '#system'
    }
  ];

  const AdminSidebar = () => (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Admin Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminSections.map((section) => (
                <SidebarMenuItem key={section.id}>
                  <SidebarMenuButton
                    isActive={activeSection === section.id}
                    onClick={() => setActiveSection(section.id)}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <section.icon className="w-4 h-4" />
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{section.title}</span>
                      <span className="text-xs text-muted-foreground">{section.description}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                Manage your TCG inventory system, Shopify integration, and user access.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {adminSections.slice(1).map((section) => (
                <Card 
                  key={section.id} 
                  className="cursor-pointer hover:shadow-md transition-all duration-200 hover:scale-105"
                  onClick={() => setActiveSection(section.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <section.icon className="w-5 h-5 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setActiveSection('users')}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Manage Users
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setActiveSection('system')}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View Logs
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => setActiveSection('stores')}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Sync Settings
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Database Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Connection</span>
                    <Badge variant="secondary">Connected</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">TCG Catalog</span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Sync Status</span>
                    <Badge variant="secondary">Running</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Shopify Integration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">API Connection</span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto Sync</span>
                    <Badge variant="secondary">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Products Synced</span>
                    <Badge variant="secondary">2,456</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'stores':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Store Management</h1>
              <p className="text-muted-foreground">
                Configure Shopify integration, inventory sync, and product management.
              </p>
            </div>
            <ShopifyConfig />
            <ShopifySyncQueue />
            <InventorySyncSettings />
            <ShopifyTagImport />
          </div>
        );

      case 'catalog':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Catalog & Data Management</h1>
              <p className="text-muted-foreground">
                Manage TCG database connections, card catalogs, and intake settings.
              </p>
            </div>
            <TCGDatabaseSettings />
            <RawIntakeSettings />
            <CatalogTab />
            <PSAApiSettings />
          </div>
        );

      case 'users':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
              <p className="text-muted-foreground">
                Manage user assignments, store access, and permissions.
              </p>
            </div>
            <UserAssignmentManager />
          </div>
        );

      case 'system':
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">System & Logs</h1>
              <p className="text-muted-foreground">
                View system logs, debug information, and monitor system health.
              </p>
            </div>
            <SystemLogsViewer />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <SidebarInset className="flex-1">
          {/* Header */}
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Link to="/">
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                <Home className="w-4 h-4" />
                Back to Dashboard
              </Button>
            </Link>
            <div className="ml-auto">
              <Navigation showMobileMenu={true} />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6">
            {renderSectionContent()}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Admin;