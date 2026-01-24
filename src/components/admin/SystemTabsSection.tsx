import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollText, Gauge, FileText, Wrench, Bell } from 'lucide-react';
import { SystemLogsViewer } from '@/components/admin/SystemLogsViewer';
import { RegionalAuditLog } from '@/components/admin/RegionalAuditLog';
import { SKUDuplicateCleanup } from '@/components/admin/SKUDuplicateCleanup';
import { DuplicateCleanup } from '@/components/admin/DuplicateCleanup';
import { PreflightIndexCheck } from '@/components/admin/PreflightIndexCheck';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function SystemTabsSection() {
  return (
    <div className="space-y-6">
      {/* Discord Notifications Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Discord Notifications
              </CardTitle>
              <CardDescription>
                Configure Discord alerts for eBay orders with business-hours logic
              </CardDescription>
            </div>
            <Link to="/admin/notifications/discord">
              <Button>Configure</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set up Discord webhooks, staff mentions, and message templates for immediate and queued notifications based on Hawaii business hours (9am-7pm).
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="logs" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="logs" className="flex items-center gap-2">
          <ScrollText className="w-4 h-4" />
          <span>Logs</span>
        </TabsTrigger>
        <TabsTrigger value="performance" className="flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          <span>Performance</span>
        </TabsTrigger>
        <TabsTrigger value="maintenance" className="flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          <span>Maintenance</span>
        </TabsTrigger>
        <TabsTrigger value="audit" className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span>Audit Trail</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="logs" className="space-y-4">
        <SystemLogsViewer />
      </TabsContent>

      <TabsContent value="performance" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Performance Metrics</CardTitle>
            <CardDescription>System query times and API latency monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Performance monitoring coming soon...</p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="maintenance" className="space-y-4">
        <PreflightIndexCheck />
        <DuplicateCleanup />
        <SKUDuplicateCleanup />
      </TabsContent>

      <TabsContent value="audit" className="space-y-4">
        <RegionalAuditLog />
      </TabsContent>
    </Tabs>
    </div>
  );
}
