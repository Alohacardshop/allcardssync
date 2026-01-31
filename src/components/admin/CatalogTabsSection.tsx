import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Upload, ExternalLink, Building2, Tag, MapPin } from 'lucide-react';
import TCGDatabaseSettings from './TCGDatabaseSettings';
import { TCGHealthCheck } from './TCGHealthCheck';
import { RawIntakeSettings } from './RawIntakeSettings';
import { BatchProcessingSettings } from './BatchProcessingSettings';
import { PSAApiSettings } from './PSAApiSettings';
import { VendorManagement } from './VendorManagement';
import { CategoryManagement } from './CategoryManagement';
import { PurchaseLocationsManager } from './PurchaseLocationsManager';

export function CatalogTabsSection() {
  return (
    <Tabs defaultValue="database" className="w-full">
      <TabsList className="grid w-full grid-cols-6">
        <TabsTrigger value="database" className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span className="hidden sm:inline">Database</span>
        </TabsTrigger>
        <TabsTrigger value="intake" className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Intake</span>
        </TabsTrigger>
        <TabsTrigger value="apis" className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">APIs</span>
        </TabsTrigger>
        <TabsTrigger value="vendors" className="flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          <span className="hidden sm:inline">Vendors</span>
        </TabsTrigger>
        <TabsTrigger value="categories" className="flex items-center gap-2">
          <Tag className="w-4 h-4" />
          <span className="hidden sm:inline">Categories</span>
        </TabsTrigger>
        <TabsTrigger value="locations" className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <span className="hidden sm:inline">Locations</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="database" className="space-y-4">
        <TCGDatabaseSettings />
        <TCGHealthCheck />
      </TabsContent>

      <TabsContent value="intake" className="space-y-4">
        <RawIntakeSettings />
        <BatchProcessingSettings />
      </TabsContent>

      <TabsContent value="apis" className="space-y-4">
        <PSAApiSettings />
      </TabsContent>

      <TabsContent value="vendors" className="space-y-4">
        <VendorManagement />
      </TabsContent>

      <TabsContent value="categories" className="space-y-4">
        <CategoryManagement />
      </TabsContent>

      <TabsContent value="locations" className="space-y-4">
        <PurchaseLocationsManager />
      </TabsContent>
    </Tabs>
  );
}
