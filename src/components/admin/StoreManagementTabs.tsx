import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShopifyIntegrationTest } from "./ShopifyIntegrationTest";
import { ShopifySyncReconciliation } from "./ShopifySyncReconciliation";
import { VendorManagement } from "./VendorManagement";
import { DuplicateCleanup } from "./DuplicateCleanup";
import ShopifyEnvironmentSetup from "./ShopifyEnvironmentSetup";
import { ShopifyConfig } from "./ShopifyConfig";
import { ShopifyMetafieldSetup } from "./ShopifyMetafieldSetup";
import { ShopifyWebhookStatus } from "./ShopifyWebhookStatus";
import { WebhookMonitor } from "./WebhookMonitor";
import { ShopifyReconciliation } from "./ShopifyReconciliation";
import { ShopifyInventoryImport } from "./ShopifyInventoryImport";
import { InventorySyncSettings } from "./InventorySyncSettings";
import { WebhookTestPanel } from "./WebhookTestPanel";
import { ShopifyTagImport } from "./ShopifyTagImport";
import ShopifyQueueTest from "./ShopifyQueueTest";

export function StoreManagementTabs() {
  return (
    <Tabs defaultValue="config" className="space-y-6">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="config">Configuration</TabsTrigger>
        <TabsTrigger value="sync">Sync & Import</TabsTrigger>
        <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        <TabsTrigger value="testing">Testing</TabsTrigger>
        <TabsTrigger value="data">Data Management</TabsTrigger>
      </TabsList>

      {/* Configuration Tab */}
      <TabsContent value="config" className="space-y-6">
        <ShopifyEnvironmentSetup />
        <ShopifyConfig />
        <ShopifyMetafieldSetup />
      </TabsContent>

      {/* Sync & Import Tab */}
      <TabsContent value="sync" className="space-y-6">
        <ShopifyInventoryImport />
        <InventorySyncSettings />
        <ShopifySyncReconciliation />
        <ShopifyTagImport />
      </TabsContent>

      {/* Webhooks Tab */}
      <TabsContent value="webhooks" className="space-y-6">
        <ShopifyWebhookStatus />
        <WebhookMonitor />
      </TabsContent>

      {/* Testing & Diagnostics Tab */}
      <TabsContent value="testing" className="space-y-6">
        <ShopifyIntegrationTest />
        <WebhookTestPanel />
        <ShopifyQueueTest />
      </TabsContent>

      {/* Data Management Tab */}
      <TabsContent value="data" className="space-y-6">
        <VendorManagement />
        <DuplicateCleanup />
        <ShopifyReconciliation />
      </TabsContent>
    </Tabs>
  );
}
