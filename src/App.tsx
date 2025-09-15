import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundaryWrapper";
import { StoreProvider } from "@/contexts/StoreContext";
import Index from "./pages/Index";
import DashboardPage from "./pages/DashboardPage";
import TestHardwarePage from "./pages/TestHardwarePage";
import Inventory from "./pages/Inventory";
import Batches from "./pages/Batches";
import { LabelDesigner } from "./pages/LabelDesigner";
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

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isDestroyed = false;

    // Set timeout for auth check (30 seconds max)
    timeoutId = setTimeout(() => {
      if (!isDestroyed) {
        console.error("Auth check timed out after 30 seconds");
        setAuthTimeout(true);
        setChecking(false);
        setAllowed(false);
      }
    }, 30000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isDestroyed) return;
      
      clearTimeout(timeoutId);
      
      if (!session?.user) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      
      // Defer role check with timeout protection
      setTimeout(async () => {
        if (isDestroyed) return;
        
        try {
          const uid = session.user.id;
          
          // Check staff role with timeout
          const staffPromise = supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any });
          const staff = await Promise.race([
            staffPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Role check timeout")), 10000)
            )
          ]) as any;
          
          const isStaff = (staff.data as boolean) === true;
          if (isStaff && !isDestroyed) {
            setAllowed(true);
            setChecking(false);
            return;
          }
          
          // Check admin role with timeout
          const adminPromise = supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any });
          const admin = await Promise.race([
            adminPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Role check timeout")), 10000)
            )
          ]) as any;
          
          const isAdmin = (admin.data as boolean) === true;
          if (!isDestroyed) {
            setAllowed(isAdmin);
            setChecking(false);
          }
        } catch (e) {
          if (!isDestroyed) {
            console.error("Role check failed:", e);
            setAllowed(false);
            setChecking(false);
          }
        }
      }, 100);
    });
    
    // Initial session check with timeout
    const sessionCheckTimeout = setTimeout(async () => {
      if (isDestroyed) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user && !isDestroyed) {
          setAllowed(false);
          setChecking(false);
        }
      } catch (error) {
        if (!isDestroyed) {
          console.error("Initial session check failed:", error);
          setAllowed(false);
          setChecking(false);
        }
      }
    }, 100);

    // Cleanup function
    return () => {
      isDestroyed = true;
      clearTimeout(timeoutId);
      clearTimeout(sessionCheckTimeout);
      subscription.unsubscribe();
    };
  }, []);

  if (authTimeout) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-destructive mb-4">Authentication check timed out</p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-primary text-primary-foreground px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (checking) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  if (!allowed) return <Navigate to="/auth" replace />;
  return children;
}

const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="allcardssync-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StoreProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><ErrorBoundaryWrapper componentName="Dashboard"><DashboardPage /></ErrorBoundaryWrapper></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><ErrorBoundaryWrapper componentName="Dashboard"><DashboardPage /></ErrorBoundaryWrapper></ProtectedRoute>} />
              <Route path="/test-hardware" element={<ProtectedRoute><TestHardwarePage /></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><ErrorBoundaryWrapper componentName="Inventory"><Inventory /></ErrorBoundaryWrapper></ProtectedRoute>} />
              <Route path="/batches" element={<ProtectedRoute><ErrorBoundaryWrapper componentName="Batch Management"><Batches /></ErrorBoundaryWrapper></ProtectedRoute>} />
              <Route path="/labels" element={<ProtectedRoute><LabelDesigner /></ProtectedRoute>} />
              <Route path="/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/admin/catalog" element={<ProtectedRoute><div className="p-8"><CatalogMigrationPlaceholder /></div></ProtectedRoute>} />
              <Route path="/shopify-mapping" element={<ProtectedRoute><ShopifyMapping /></ProtectedRoute>} />
              <Route path="/print-logs" element={<ProtectedRoute><PrintLogs /></ProtectedRoute>} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            
            {/* Global Components */}
            <GlobalKeyboardHandler />
            <FloatingActionButton />
            <PerformanceMonitor />
            <SessionTimeoutWarning />
            <RecoveryMode />
          </BrowserRouter>
        </StoreProvider>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
