import { useState } from "react";
import { BulkTransferScanner } from "@/components/BulkTransferScanner";
import { TransferItemsList } from "@/components/TransferItemsList";
import { TransferHistoryLog } from "@/components/TransferHistoryLog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default function BulkTransfer() {
  const [refreshHistory, setRefreshHistory] = useState(0);

  const handleTransferComplete = () => {
    setRefreshHistory(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 space-y-6">
        <PageHeader
          title="Bulk Location Transfer"
          description="Scan barcodes to transfer items between locations"
          showEcosystem
        />

        <Tabs defaultValue="transfer" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transfer" className="gap-2">
              <Package className="h-4 w-4" />
              Transfer Items
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              Transfer History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transfer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scan Items to Transfer</CardTitle>
                <CardDescription>
                  Select destination location and scan barcodes to add items to the transfer batch
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BulkTransferScanner onTransferComplete={handleTransferComplete} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Transfer History</CardTitle>
                <CardDescription>
                  View past location transfers and their details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TransferHistoryLog key={refreshHistory} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
