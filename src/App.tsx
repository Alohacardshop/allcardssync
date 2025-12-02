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
import { RequireApp } from "@/components/RequireApp";
import { DashboardLayout } from "@/layouts/DashboardLayout";
// Lazy load heavy routes
const DashboardHome = React.lazy(() => import("./pages/DashboardHome"));
const Index = React.lazy(() => import("./pages/Index"));
const DashboardPage = React.lazy(() => import("./pages/DashboardPage"));
const DocumentsPage = React.lazy(() => import("./features/docs/pages/DocumentsPage"));
const TestHardwarePage = React.lazy(() => import("./pages/TestHardwarePage"));
const Inventory = React.lazy(() => import("./pages/Inventory"));
const Batches = React.lazy(() => import("./pages/Batches"));
const Admin = React.lazy(() => import("./pages/Admin"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Auth = React.lazy(() => import("./pages/Auth"));
const BarcodePrinting = React.lazy(() => import("./pages/BarcodePrinting"));
const ShopifyMapping = React.lazy(() => import("./pages/ShopifyMapping"));
const ShopifySync = React.lazy(() => import("./pages/ShopifySync"));
const BulkImport = React.lazy(() => import("./pages/BulkImport"));
const BulkTransfer = React.lazy(() => import("./pages/BulkTransfer"));
const DiscordNotifications = React.lazy(() => import("./pages/admin/DiscordNotifications"));
const PendingNotifications = React.lazy(() => import("./pages/PendingNotifications"));
const GradedIntake = React.lazy(() => import("./pages/intake/GradedIntake"));
const BulkIntake = React.lazy(() => import("./pages/intake/BulkIntake"));
const ShopifyBackfill = React.lazy(() => import("./pages/Admin/ShopifyBackfill"));
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
                            {/* Dashboard Home */}
                            <Route path="/" element={<ErrorBoundaryWrapper componentName="DashboardHome"><DashboardHome /></ErrorBoundaryWrapper>} />
                            
                            {/* Intake App (formerly Index) */}
                            <Route path="/intake" element={
                              <RequireApp appKey="intake">
                                <ErrorBoundaryWrapper componentName="Intake"><Index /></ErrorBoundaryWrapper>
                              </RequireApp>
                            } />
                            <Route path="/intake/graded" element={<RequireApp appKey="intake"><GradedIntake /></RequireApp>} />
                            <Route path="/intake/bulk" element={<RequireApp appKey="intake"><BulkIntake /></RequireApp>} />
                            
                            {/* Inventory App */}
                            <Route path="/inventory" element={
                              <RequireApp appKey="inventory">
                                <ErrorBoundaryWrapper componentName="Inventory"><Inventory /></ErrorBoundaryWrapper>
                              </RequireApp>
                            } />
                            <Route path="/batches" element={<RequireApp appKey="inventory"><ErrorBoundaryWrapper componentName="Batch Management"><Batches /></ErrorBoundaryWrapper></RequireApp>} />
                            <Route path="/bulk-import" element={<RequireApp appKey="inventory"><BulkImport /></RequireApp>} />
                            <Route path="/bulk-transfer" element={<RequireApp appKey="inventory"><BulkTransfer /></RequireApp>} />
                            <Route path="/shopify-mapping" element={<RequireApp appKey="inventory"><ShopifyMapping /></RequireApp>} />
                            <Route path="/shopify-sync" element={<RequireApp appKey="inventory"><ShopifySync /></RequireApp>} />
                            
                            {/* Barcode App */}
                            <Route path="/barcode-printing" element={
                              <RequireApp appKey="barcode">
                                <ErrorBoundaryWrapper componentName="BarcodePrinting"><BarcodePrinting /></ErrorBoundaryWrapper>
                              </RequireApp>
                            } />
                            
                            {/* Documents App */}
                            <Route path="/docs" element={
                              <RequireApp appKey="docs">
                                <ErrorBoundaryWrapper componentName="Documents"><DocumentsPage /></ErrorBoundaryWrapper>
                              </RequireApp>
                            } />
                            
                            {/* Admin App */}
                            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
                            <Route path="/admin/catalog" element={<AdminGuard><div className="p-8"><CatalogMigrationPlaceholder /></div></AdminGuard>} />
                            <Route path="/admin/notifications/discord" element={<AdminGuard><DiscordNotifications /></AdminGuard>} />
                            <Route path="/admin/notifications/pending" element={<AdminGuard><PendingNotifications /></AdminGuard>} />
                            <Route path="/admin/shopify-backfill" element={<AdminGuard><ShopifyBackfill /></AdminGuard>} />
                            
                            {/* Other Pages */}
                            <Route path="/dashboard" element={<ErrorBoundaryWrapper componentName="Dashboard"><DashboardPage /></ErrorBoundaryWrapper>} />
                            <Route path="/test-hardware" element={<TestHardwarePage />} />
                            
                            {/* Legacy routes - redirect */}
                            <Route path="/labels" element={<Navigate to="/barcode-printing" replace />} />
                            <Route path="/print-logs" element={<Navigate to="/barcode-printing" replace />} />
                            <Route path="/admin/label-studio" element={<Navigate to="/barcode-printing" replace />} />
                            
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
