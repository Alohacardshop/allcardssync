import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, ExternalLink, ShoppingCart, Clock, Package } from 'lucide-react';
import { EbaySyncQueueMonitor } from './EbaySyncQueueMonitor';
import { EbayBulkListing } from './EbayBulkListing';

export function EbayManagement() {
  return (
    <div className="space-y-6">
      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                eBay Integration
              </CardTitle>
              <CardDescription>
                Manage eBay listings, sync queue, and settings
              </CardDescription>
            </div>
            <Link to="/admin/ebay-settings">
              <Button variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                eBay Settings
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* Main Tabs */}
      <Tabs defaultValue="bulk" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bulk" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Bulk Listing
          </TabsTrigger>
          <TabsTrigger value="queue" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Sync Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bulk">
          <EbayBulkListing />
        </TabsContent>

        <TabsContent value="queue">
          <EbaySyncQueueMonitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
