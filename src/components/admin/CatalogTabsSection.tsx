import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Upload, ExternalLink } from 'lucide-react';
import TCGDatabaseSettings from './TCGDatabaseSettings';
import { TCGHealthCheck } from './TCGHealthCheck';
import { RawIntakeSettings } from './RawIntakeSettings';
import { BatchProcessingSettings } from './BatchProcessingSettings';
import { PSAApiSettings } from './PSAApiSettings';

export function CatalogTabsSection() {
  return (
    <Tabs defaultValue="database" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="database" className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span>Database</span>
        </TabsTrigger>
        <TabsTrigger value="intake" className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          <span>Intake</span>
        </TabsTrigger>
        <TabsTrigger value="apis" className="flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          <span>External APIs</span>
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
    </Tabs>
  );
}
