import React, { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { 
  RefreshCw, 
  MapPin, 
  ShoppingCart, 
  AlertTriangle,
  Activity
} from "lucide-react";

// Lazy load components for better performance
const LocationDriftMonitor = React.lazy(() => 
  import("@/components/admin/LocationDriftMonitor").then(m => ({ default: m.LocationDriftMonitor }))
);
const RetryJobsMonitor = React.lazy(() => 
  import("@/components/admin/RetryJobsMonitor").then(m => ({ default: m.RetryJobsMonitor }))
);
const SalesEventLog = React.lazy(() => 
  import("@/components/admin/SalesEventLog").then(m => ({ default: m.SalesEventLog }))
);
const DeadLetterDashboard = React.lazy(() => 
  import("@/components/admin/DeadLetterDashboard").then(m => ({ default: m.DeadLetterDashboard }))
);

export default function InventorySyncDashboard() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Inventory Sync Monitor"
        description="Track cross-channel inventory synchronization, detect drift, and manage retries"
      />

      <Tabs defaultValue="drift" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="drift" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Location Drift</span>
            <span className="sm:hidden">Drift</span>
          </TabsTrigger>
          <TabsTrigger value="retries" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Retry Queue</span>
            <span className="sm:hidden">Retries</span>
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Sales Events</span>
            <span className="sm:hidden">Sales</span>
          </TabsTrigger>
          <TabsTrigger value="deadletter" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">Dead Letter</span>
            <span className="sm:hidden">Dead</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drift">
          <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
            <LocationDriftMonitor />
          </Suspense>
        </TabsContent>

        <TabsContent value="retries">
          <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
            <RetryJobsMonitor />
          </Suspense>
        </TabsContent>

        <TabsContent value="sales">
          <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
            <SalesEventLog />
          </Suspense>
        </TabsContent>

        <TabsContent value="deadletter">
          <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
            <DeadLetterDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
