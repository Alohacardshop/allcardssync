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
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage";
import TestHardwarePage from "./pages/TestHardwarePage";
import Inventory from "./pages/Inventory";
import Batches from "./pages/Batches";
import LabelStudio from "./pages/admin/LabelStudio";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import PrintLogs from "./pages/PrintLogs";
import ZPLSettings from "./pages/ZPLSettings";
import ShopifyMapping from "./pages/ShopifyMapping";
import BulkImport from "./pages/BulkImport";
import { GlobalKeyboardHandler } from "./components/GlobalKeyboardHandler";
import { FloatingActionButton } from "./components/FloatingActionButton";
import { PerformanceMonitor } from "./components/PerformanceMonitor";
import { SessionTimeoutWarning, RecoveryMode } from "./components/OperationalSafeguards";

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
            <BrowserRouter>
            <Routes>
              {/* Auth route - accessible without authentication */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Protected routes */}
              <Route path="/*" element={
                <>
                  <NavigationBar />
                  <AuthGuard>
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
                      <Route path="/print-logs" element={<PrintLogs />} />
                      
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AuthGuard>
                </>
              } />
            </Routes>
            
            {/* Global Components */}
            <GlobalKeyboardHandler />
            <FloatingActionButton />
            <PerformanceMonitor />
            <SessionTimeoutWarning />
            <RecoveryMode />
          </BrowserRouter>
        </StoreProvider>
      </PrintNodeProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
</ErrorBoundary>
);

export default App;
