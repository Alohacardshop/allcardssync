import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { StoreProvider } from "@/contexts/StoreContext";
import Index from "./pages/Index";
import Inventory from "./pages/Inventory";
import Batches from "./pages/Batches";
import LabelDesigner from "./pages/LabelDesigner";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import PrintLogs from "./pages/PrintLogs";
import ShopifyMapping from "./pages/ShopifyMapping";
import ShopifyInspect from "./pages/ShopifyInspect";
import BulkImport from "./pages/BulkImport";

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

  useEffect(() => {
    // Listen first
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      // Defer role check to avoid deadlocks
      setTimeout(async () => {
        try {
          const uid = session.user.id;
          const staff = await supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any });
          const isStaff = (staff.data as boolean) === true;
          if (isStaff) {
            setAllowed(true);
            setChecking(false);
            return;
          }
          const admin = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any });
          const isAdmin = (admin.data as boolean) === true;
          setAllowed(isAdmin);
        } catch (e) {
          if (process.env.NODE_ENV === 'development') {
            console.error("Role check failed", e);
          }
          setAllowed(false);
        } finally {
          setChecking(false);
        }
      }, 0);
    });
    // Seed with current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setAllowed(false);
        setChecking(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) return <div />;
  if (!allowed) return <Navigate to="/auth" replace />;
  return children;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<ProtectedRoute><StoreProvider><Index /></StoreProvider></ProtectedRoute>} />
              <Route path="/inventory" element={<ProtectedRoute><StoreProvider><Inventory /></StoreProvider></ProtectedRoute>} />
              <Route path="/batches" element={<ProtectedRoute><StoreProvider><Batches /></StoreProvider></ProtectedRoute>} />
              <Route path="/labels" element={<ProtectedRoute><StoreProvider><LabelDesigner /></StoreProvider></ProtectedRoute>} />
              <Route path="/bulk-import" element={<ProtectedRoute><StoreProvider><BulkImport /></StoreProvider></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><StoreProvider><Admin /></StoreProvider></ProtectedRoute>} />
              <Route path="/admin/catalog" element={<ProtectedRoute><StoreProvider><div className="p-8"><CatalogMigrationPlaceholder /></div></StoreProvider></ProtectedRoute>} />
              <Route path="/shopify-inspect" element={<ProtectedRoute><StoreProvider><ShopifyInspect /></StoreProvider></ProtectedRoute>} />
              <Route path="/shopify-mapping" element={<ProtectedRoute><StoreProvider><ShopifyMapping /></StoreProvider></ProtectedRoute>} />
              <Route path="/print-logs" element={<ProtectedRoute><StoreProvider><PrintLogs /></StoreProvider></ProtectedRoute>} />
              
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
