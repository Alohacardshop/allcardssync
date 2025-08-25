import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Index from "./pages/Index";
import Inventory from "./pages/Inventory";
import LabelDesigner from "./pages/LabelDesigner";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import PrintLogs from "./pages/PrintLogs";
import ShopifyMapping from "./pages/ShopifyMapping";
import BulkImport from "./pages/BulkImport";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

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
          console.error("Role check failed", e);
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
          <Route path="/labels" element={<ProtectedRoute><LabelDesigner /></ProtectedRoute>} />
          <Route path="/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/shopify-mapping" element={<ProtectedRoute><ShopifyMapping /></ProtectedRoute>} />
            <Route path="/print-logs" element={<ProtectedRoute><PrintLogs /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
