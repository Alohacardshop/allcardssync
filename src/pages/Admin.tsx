import { useState, useEffect } from "react";
import {
  Settings,
  Store,
  Database,
  Users,
  Printer,
  LayoutDashboard,
  Package,
  Building2,
  Command,
  Menu,
  Tag,
  MapPin
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SystemHealthDashboard } from "@/components/admin/SystemHealthDashboard";
import { StoreManagementTabs } from "@/components/admin/StoreManagementTabs";
import { QueueManagementTabs } from "@/components/admin/QueueManagementTabs";
import { UserAssignmentManager } from "@/components/UserAssignmentManager";
import { VendorManagement } from "@/components/admin/VendorManagement";
import { ActivityFeed } from "@/components/admin/ActivityFeed";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import { MetricsBar } from "@/components/admin/MetricsBar";
import { EnhancedBreadcrumb } from "@/components/admin/EnhancedBreadcrumb";
import { CatalogTabsSection } from "@/components/admin/CatalogTabsSection";
import { HardwareTabsSection } from "@/components/admin/HardwareTabsSection";
import { SystemTabsSection } from "@/components/admin/SystemTabsSection";
import { CategoryManagement } from "@/components/admin/CategoryManagement";
import { PurchaseLocationsManager } from "@/components/admin/PurchaseLocationsManager";

const adminSections = [
  {
    id: 'overview',
    title: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'store',
    title: 'Store',
    icon: Store,
  },
  {
    id: 'catalog',
    title: 'Catalog',
    icon: Database,
  },
  {
    id: 'queue',
    title: 'Queue',
    icon: Package,
  },
  {
    id: 'users',
    title: 'Users',
    icon: Users,
  },
  {
    id: 'hardware',
    title: 'Hardware',
    icon: Printer,
  },
  {
    id: 'system',
    title: 'System',
    icon: Settings,
  },
  {
    id: 'vendors',
    title: 'Vendors',
    icon: Building2,
  },
  {
    id: 'categories',
    title: 'Categories',
    icon: Tag,
  },
  {
    id: 'purchase-locations',
    title: 'Purchase Locations',
    icon: MapPin,
  },
];

export default function Admin() {
  const [activeSection, setActiveSection] = useState('overview');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // ⌘1-8 for quick section switching
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (adminSections[index]) {
          setActiveSection(adminSections[index].id);
        }
      }
      // ⌘B for sidebar toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <MetricsBar />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SystemHealthDashboard />
              </div>
              <div>
                <ActivityFeed />
              </div>
            </div>
          </div>
        );
      case 'store':
        return <StoreManagementTabs />;
      case 'catalog':
        return <CatalogTabsSection />;
      case 'queue':
        return <QueueManagementTabs />;
      case 'users':
        return <UserAssignmentManager />;
      case 'hardware':
        return <HardwareTabsSection />;
      case 'system':
        return <SystemTabsSection />;
      case 'vendors':
        return <VendorManagement />;
      case 'categories':
        return <CategoryManagement />;
      case 'purchase-locations':
        return <PurchaseLocationsManager />;
      default:
        return <div>Section not found</div>;
    }
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          {/* Compact Sidebar */}
          <Sidebar 
            className={sidebarCollapsed ? "w-16" : "w-72"} 
            collapsible="icon"
          >
            <SidebarHeader className="border-b p-4">
              <div className="flex items-center justify-between">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold">Admin</h1>
                      <p className="text-xs text-muted-foreground">Portal</p>
                    </div>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="ml-auto"
                >
                  <Menu className="w-4 h-4" />
                </Button>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-2">
              <SidebarMenu>
                {adminSections.map((section) => (
                  <SidebarMenuItem key={section.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton
                          onClick={() => setActiveSection(section.id)}
                          isActive={activeSection === section.id}
                          className="w-full justify-start gap-3 px-3 py-2 hover:bg-accent transition-colors"
                        >
                          <section.icon className="w-5 h-5" />
                          {!sidebarCollapsed && (
                            <span className="font-medium">{section.title}</span>
                          )}
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {sidebarCollapsed && (
                        <TooltipContent side="right">
                          <p>{section.title}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarContent>

            {/* Back to Dashboard Link */}
            {!sidebarCollapsed && (
              <div className="mt-auto border-t p-4">
                <Link to="/">
                  <Button variant="ghost" className="w-full justify-start">
                    ← Back to Dashboard
                  </Button>
                </Link>
              </div>
            )}
          </Sidebar>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <EnhancedBreadcrumb currentSection={activeSection} />
                  
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setCommandPaletteOpen(true)}
                        >
                          <Command className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Command Palette (⌘K)</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6">
              {renderSectionContent()}
            </div>
          </main>

          <AdminCommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            onNavigate={setActiveSection}
          />
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
