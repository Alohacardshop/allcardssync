import { PageHeader } from '@/components/layout/PageHeader';
import { CrossRegionTransferManager } from '@/components/transfers/CrossRegionTransferManager';

export default function CrossRegionTransfers() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <PageHeader
        title="Cross-Region Transfers"
        description="Request and manage inventory transfers between Hawaii and Las Vegas"
      />
      <CrossRegionTransferManager />
    </div>
  );
}
