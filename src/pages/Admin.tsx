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
import { Link } from 'react-router-dom';

const Admin = () => {
  const [activeSection, setActiveSection] = useState('overview');

  const adminSections = [
    {
      id: 'overview',
      title: 'Overview',
      icon: BarChart3,
      description: 'System overview and quick actions'
    },
    {
      id: 'stores',
      title: 'Store Management',
      icon: ShoppingCart,
      description: 'Shopify integration and inventory sync'
    },
    {
      id: 'catalog',
      title: 'Catalog & Data',
      icon: Database,
      description: 'TCG database and card catalog settings'
    },
    {
      id: 'users',
      title: 'User Management',
      icon: Users,
      description: 'User assignments and permissions'
    },
    {
      id: 'system',
      title: 'System & Logs',
      icon: Server,
      description: 'System logs and debugging tools'
    }
  ];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">System Overview</h2>
              <p className="text-muted-foreground mb-6">
                Manage your TCG inventory system, Shopify integration, and user access.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {adminSections.slice(1).map((section) => (
                <Card 
                  key={section.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setActiveSection(section.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <section.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{section.title}</CardTitle>
                      </div>
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
              <h2 className="text-2xl font-bold mb-2">Store Management</h2>
              <p className="text-muted-foreground mb-6">
                Configure Shopify integration, inventory sync, and product management.
              </p>
            </div>
            <ShopifyConfig />
            <InventorySyncSettings />
            <ShopifyTagImport />
          </div>
        );

      case 'catalog':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Catalog & Data Management</h2>
              <p className="text-muted-foreground mb-6">
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
              <h2 className="text-2xl font-bold mb-2">User Management</h2>
              <p className="text-muted-foreground mb-6">
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
              <h2 className="text-2xl font-bold mb-2">System & Logs</h2>
              <p className="text-muted-foreground mb-6">
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

      <div className="flex min-h-screen">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-muted/30 border-r">
          <div className="p-4">
            <nav className="space-y-2">
              {adminSections.map((section) => (
                <Button
                  key={section.id}
                  variant={activeSection === section.id ? "default" : "ghost"}
                  className="w-full justify-start h-auto py-3"
                  onClick={() => setActiveSection(section.id)}
                >
                  <section.icon className="w-5 h-5 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">{section.title}</div>
                    <div className="text-xs opacity-60">{section.description}</div>
                  </div>
                </Button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="container mx-auto p-6">
            {renderSectionContent()}
          </div>
        </div>
      </div>
    </>
  );
};

export default Admin;