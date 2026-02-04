import React, { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const SyncHealthDashboard = React.lazy(() => 
  import("@/components/admin/SyncHealthDashboard").then(m => ({ default: m.SyncHealthDashboard }))
);

export default function SyncHealthPage() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Sync Health"
        description="Monitor webhook activity, reconciliation runs, and inventory drift status"
      />
      
      <Suspense fallback={<div className="flex justify-center py-8"><LoadingSpinner /></div>}>
        <SyncHealthDashboard />
      </Suspense>
    </div>
  );
}
