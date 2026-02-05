import { useState, useEffect, Suspense } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Command, ChevronLeft } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AuthGuard } from '@/components/AuthGuard';
import { AdminGuard } from '@/components/AdminGuard';
import { FullScreenLoader } from '@/components/ui/FullScreenLoader';
import { AdminCommandPalette } from '@/components/admin/AdminCommandPalette';
import { PATHS } from '@/routes/paths';
import { ADMIN_NAV_SECTIONS, ADMIN_TOOLS, getAdminNavById } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { Settings } from 'lucide-react';

/**
 * Admin layout with dedicated sidebar and header
 * Uses centralized navigation from @/config/navigation
 */
export function AdminLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarCollapsed(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isActive = (path: string) => {
    // Handle query param sections
    if (path.includes('?section=')) {
      return location.pathname === PATHS.admin && location.search === path.replace(PATHS.admin, '');
    }
    // Exact match for admin root
    if (path === PATHS.admin) {
      return location.pathname === PATHS.admin && !location.search;
    }
    // Prefix match for sub-pages
    return location.pathname.startsWith(path);
  };

  const handleNavigate = (sectionId: string) => {
    // Used by command palette - find matching nav item and navigate
    const navItem = getAdminNavById(sectionId);
    if (navItem) {
      navigate(navItem.path);
    }
  };

  return (
    <AuthGuard>
      <AdminGuard>
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-background">
              {/* Admin Sidebar */}
              <Sidebar
                className={cn(
                  'transition-all duration-300',
                  sidebarCollapsed ? 'w-16' : 'w-64'
                )}
                collapsible="icon"
              >
                <SidebarHeader className="border-b p-4">
                  <div className="flex items-center justify-between">
                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-accent text-primary-foreground">
                          <Settings className="w-5 h-5" />
                        </div>
                        <div>
                          <h1 className="text-lg font-bold">Admin</h1>
                          <p className="text-xs text-muted-foreground">Control Center</p>
                        </div>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                      className="ml-auto hover:bg-primary/10"
                    >
                      <Menu className="w-4 h-4" />
                    </Button>
                  </div>
                </SidebarHeader>

                <SidebarContent className="p-2 flex flex-col">
                  {/* Main sections */}
                  <div className="flex-1">
                    {!sidebarCollapsed && (
                      <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Sections
                      </p>
                    )}
                    <SidebarMenu>
                      {ADMIN_NAV_SECTIONS.map((section) => (
                        <SidebarMenuItem key={section.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuButton
                                asChild
                                isActive={isActive(section.path)}
                                className="w-full justify-start gap-3 px-3 py-2"
                              >
                                <Link to={section.path}>
                                  <section.icon className="w-5 h-5 flex-shrink-0" />
                                  {!sidebarCollapsed && (
                                    <span className="font-medium">{section.title}</span>
                                  )}
                                </Link>
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

                    {/* Tools section */}
                    <div className="mt-6">
                      {!sidebarCollapsed && (
                        <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Tools
                        </p>
                      )}
                      <SidebarMenu>
                        {ADMIN_TOOLS.map((tool) => (
                          <SidebarMenuItem key={tool.id}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <SidebarMenuButton
                                  asChild
                                  isActive={isActive(tool.path)}
                                  className="w-full justify-start gap-3 px-3 py-2"
                                >
                                  <Link to={tool.path}>
                                    <tool.icon className="w-5 h-5 flex-shrink-0" />
                                    {!sidebarCollapsed && (
                                      <span className="font-medium">{tool.title}</span>
                                    )}
                                  </Link>
                                </SidebarMenuButton>
                              </TooltipTrigger>
                              {sidebarCollapsed && (
                                <TooltipContent side="right">
                                  <p>{tool.title}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </div>
                  </div>

                  {/* Back to Dashboard */}
                  <div className="border-t pt-4 mt-4">
                    <Link to={PATHS.dashboard}>
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start gap-2',
                          sidebarCollapsed && 'justify-center px-2'
                        )}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        {!sidebarCollapsed && <span>Back to Dashboard</span>}
                      </Button>
                    </Link>
                  </div>
                </SidebarContent>
              </Sidebar>

              {/* Main Content Area */}
              <main className="flex-1 overflow-auto">
                {/* Admin Header */}
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Link to={PATHS.admin} className="hover:text-foreground">
                        Admin
                      </Link>
                      {location.pathname !== PATHS.admin && (
                        <>
                          <span>/</span>
                          <span className="text-foreground font-medium">
                            {location.pathname.split('/').pop()?.replace(/-/g, ' ')}
                          </span>
                        </>
                      )}
                    </div>
                    
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

                {/* Page Content */}
                <div className="p-6">
                  <Suspense fallback={<FullScreenLoader title="Loading" subtitle="Loading admin tools…" />}>
                    <Outlet />
                  </Suspense>
                </div>
              </main>

              <AdminCommandPalette
                open={commandPaletteOpen}
                onOpenChange={setCommandPaletteOpen}
                onNavigate={handleNavigate}
              />
          </div>
        </SidebarProvider>
      </AdminGuard>
    </AuthGuard>
  );
}
