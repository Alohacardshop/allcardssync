import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundaryWrapper";
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
const ShopifyMapping = React.lazy(() => import("./pages/ShopifyMapping"));
const ShopifySync = React.lazy(() => import("./pages/ShopifySync"));
const BulkImport = React.lazy(() => import("./pages/BulkImport"));
import { GlobalKeyboardHandler } from "./components/GlobalKeyboardHandler";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { PerformanceMonitor } from "./components/PerformanceMonitor";
import { SessionTimeoutWarning, RecoveryMode } from "./components/OperationalSafeguards";
import { PrintQueueStatus } from "./components/PrintQueueStatus";

import { supabase } from "@/integrations/supabase/client";
import { CatalogMigrationPlaceholder } from "@/components/CatalogMigrationPlaceholder";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1 * 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Don't retry on auth errors
        if (error?.message?.includes('auth') || error?.status === 401) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});


const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="allcardssync-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
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
                          <Route path="/admin/label-studio" element={<LabelStudio />} />
                          <Route path="/bulk-import" element={<BulkImport />} />
                          <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
                          <Route path="/admin/catalog" element={<AdminGuard><div className="p-8"><CatalogMigrationPlaceholder /></div></AdminGuard>} />
                          <Route path="/shopify-mapping" element={<ShopifyMapping />} />
                          <Route path="/shopify-sync" element={<ShopifySync />} />
                          <Route path="/print-logs" element={<PrintLogs />} />
                          
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
            <PerformanceMonitor />
            <SessionTimeoutWarning />
            <RecoveryMode />
            <PrintQueueStatus />
          </BrowserRouter>
        </StoreProvider>
      </PrintNodeProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
</ErrorBoundary>
);

export default App;
