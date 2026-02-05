import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { StoreProvider } from "@/contexts/StoreContext";
import { PrintQueueProvider } from "@/contexts/PrintQueueContext";
import { GlobalLoading } from "@/components/GlobalLoading";
import { FontPreloader } from "@/components/fonts/FontPreloader";
import { NavigationProvider } from "@/components/NavigationProvider";
import { GlobalKeyboardHandler } from "@/components/GlobalKeyboardHandler";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
import { SessionTimeoutWarning, RecoveryMode } from "@/components/OperationalSafeguards";
import { PrintQueueStatus } from "@/components/PrintQueueStatus";
import { queryClient } from "@/lib/queryClient";

// Route modules (lazy loading handled inside each module)
import { publicRoutes } from "@/routes/public";
import { adminRoutes } from "@/routes/admin";
import { appRoutes } from "@/routes/app";

/**
 * Main App component
 * Routes handle their own Suspense boundaries via layouts
 */
const App = () => (
  <ErrorBoundary>
    <ThemeProvider defaultTheme="system" storageKey="allcardssync-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <StoreProvider>
              <PrintQueueProvider>
                <Toaster />
                <Sonner />
                <GlobalLoading />
                <FontPreloader />
                <BrowserRouter>
                  <NavigationProvider>
                    <Routes>
                      {/* Protected routes first - they match specific paths */}
                      {adminRoutes}
                      {appRoutes}
                      {/* Public routes last - includes catch-all for NotFound */}
                      {publicRoutes}
                    </Routes>
                    
                    {/* Global Components */}
                    <GlobalKeyboardHandler />
                    <FloatingActionButton />
                    {import.meta.env.DEV && <PerformanceMonitor />}
                    <SessionTimeoutWarning />
                    <RecoveryMode />
                    <PrintQueueStatus />
                  </NavigationProvider>
                </BrowserRouter>
              </PrintQueueProvider>
            </StoreProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
