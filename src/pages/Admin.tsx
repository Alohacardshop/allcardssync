import { useSearchParams } from 'react-router-dom';
import { SystemHealthDashboard } from '@/components/admin/SystemHealthDashboard';
import { StoreManagementTabs } from '@/components/admin/StoreManagementTabs';
import { QueueManagementTabs } from '@/components/admin/QueueManagementTabs';
import { UserAssignmentManager } from '@/components/UserAssignmentManager';
import { ActivityFeed } from '@/components/admin/ActivityFeed';
import { MetricsBar } from '@/components/admin/MetricsBar';
import { CatalogTabsSection } from '@/components/admin/CatalogTabsSection';
import { HardwareTabsSection } from '@/components/admin/HardwareTabsSection';
import { SystemTabsSection } from '@/components/admin/SystemTabsSection';
import { RegionSettingsEditor } from '@/components/admin/RegionSettingsEditor';
import { QuickActions } from '@/components/admin/QuickActions';
import { ConfigurationStatus } from '@/components/admin/ConfigurationStatus';

/**
 * Admin dashboard page - renders section content based on URL query param
 * Layout (sidebar/header) is handled by AdminLayout
 */
export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = searchParams.get('section') || 'overview';

  const handleNavigate = (sectionId: string) => {
    if (sectionId === 'overview') {
      setSearchParams({});
    } else {
      setSearchParams({ section: sectionId });
    }
  };

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <div className="space-y-6">
            <MetricsBar />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <QuickActions onNavigate={handleNavigate} />
              <ConfigurationStatus />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SystemHealthDashboard />
              </div>
              <div>
                <ActivityFeed />
              </div>
            </div>
          </div>
        );
      case 'store':
        return <StoreManagementTabs />;
      case 'catalog':
        return <CatalogTabsSection />;
      case 'queue':
        return <QueueManagementTabs />;
      case 'users':
        return <UserAssignmentManager />;
      case 'hardware':
        return <HardwareTabsSection />;
      case 'regions':
        return <RegionSettingsEditor />;
      case 'system':
        return <SystemTabsSection />;
      default:
        return <div className="text-muted-foreground">Section not found</div>;
    }
  };

  return renderSectionContent();
}
