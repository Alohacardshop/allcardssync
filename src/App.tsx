import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundaryWrapper";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminGuard } from "@/components/AdminGuard";
import { StoreProvider } from "@/contexts/StoreContext";
import { PrintNodeProvider } from "@/contexts/PrintNodeContext";
import { NavigationBar } from "@/components/NavigationBar";
import { GlobalLoading } from "@/components/GlobalLoading";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { FontPreloader } from "@/components/fonts/FontPreloader";
// Lazy load heavy routes
const Index = React.lazy(() => import("./pages/Index"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const TestHardwarePage = React.lazy(() => import("./pages/TestHardwarePage"));
const Inventory = React.lazy(() => import("./pages/Inventory"));
const Batches = React.lazy(() => import("./pages/Batches"));
const LabelStudio = React.lazy(() => import("./pages/admin/LabelStudio"));
const Admin = React.lazy(() => import("./pages/Admin"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Auth = React.lazy(() => import("./pages/Auth"));
const PrintLogs = React.lazy(() => import("./pages/PrintLogs"));
const ZPLSettings = React.lazy(() => import("./pages/ZPLSettings"));
const BarcodePrinting = React.lazy(() => import("./pages/BarcodePrinting"));
const ShopifyMapping = React.lazy(() => import("./pages/ShopifyMapping"));
const ShopifySync = React.lazy(() => import("./pages/ShopifySync"));
const BulkImport = React.lazy(() => import("./pages/BulkImport"));
const BulkTransfer = React.lazy(() => import("./pages/BulkTransfer"));
const DiscordNotifications = React.lazy(() => import("./pages/admin/DiscordNotifications"));
const PendingNotifications = React.lazy(() => import("./pages/PendingNotifications"));
import { GlobalKeyboardHandler } from "./components/GlobalKeyboardHandler";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { PerformanceMonitor } from "./components/PerformanceMonitor";
import { SessionTimeoutWarning, RecoveryMode } from "./components/OperationalSafeguards";
import { PrintQueueStatus } from "./components/PrintQueueStatus";

import { supabase } from "@/integrations/supabase/client";
import { CatalogMigrationPlaceholder } from "@/components/CatalogMigrationPlaceholder";

import { queryClient } from "@/lib/queryClient";


const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="allcardssync-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <PrintNodeProvider>
              <StoreProvider>
              <Toaster />
              <Sonner />
              <GlobalLoading />
              <FontPreloader />
              <BrowserRouter>
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner size="lg" /></div>}>
                <Routes>
                  {/* Auth route - accessible without authentication */}
                  <Route path="/auth" element={<Auth />} />
                  
                  {/* Protected routes */}
                  <Route path="/*" element={
                    <>
                      <NavigationBar />
                      <AuthGuard>
                        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner size="lg" /></div>}>
                          <Routes>
                            <Route path="/" element={<ErrorBoundaryWrapper componentName="Index"><Index /></ErrorBoundaryWrapper>} />
                            <Route path="/dashboard" element={<ErrorBoundaryWrapper componentName="Dashboard"><DashboardPage /></ErrorBoundaryWrapper>} />
                            <Route path="/test-hardware" element={<TestHardwarePage />} />
                            <Route path="/inventory" element={<ErrorBoundaryWrapper componentName="Inventory"><Inventory /></ErrorBoundaryWrapper>} />
                            <Route path="/batches" element={<ErrorBoundaryWrapper componentName="Batch Management"><Batches /></ErrorBoundaryWrapper>} />
                            <Route path="/bulk-import" element={<BulkImport />} />
                            <Route path="/barcode-printing" element={<BarcodePrinting />} />
                            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
                            <Route path="/admin/catalog" element={<AdminGuard><div className="p-8"><CatalogMigrationPlaceholder /></div></AdminGuard>} />
                            <Route path="/admin/notifications/discord" element={<AdminGuard><DiscordNotifications /></AdminGuard>} />
                            <Route path="/admin/notifications/pending" element={<AdminGuard><PendingNotifications /></AdminGuard>} />
                            <Route path="/shopify-mapping" element={<ShopifyMapping />} />
                            <Route path="/shopify-sync" element={<ShopifySync />} />
                            <Route path="/bulk-transfer" element={<BulkTransfer />} />
                            
                            {/* Legacy routes - redirect to new barcode printing page */}
                            <Route path="/labels" element={<BarcodePrinting />} />
                            <Route path="/print-logs" element={<BarcodePrinting />} />
                            <Route path="/admin/label-studio" element={<BarcodePrinting />} />
                            
                            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                      </AuthGuard>
                    </>
                  } />
                </Routes>
              </Suspense>
              
              {/* Global Components */}
              <GlobalKeyboardHandler />
              <FloatingActionButton />
              {import.meta.env.DEV && <PerformanceMonitor />}
              <SessionTimeoutWarning />
              <RecoveryMode />
              <PrintQueueStatus />
            </BrowserRouter>
          </StoreProvider>
        </PrintNodeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
</ErrorBoundary>
);

export default App;
