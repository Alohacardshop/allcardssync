import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PageHeader } from "@/components/layout/PageHeader";

interface PendingNotification {
  id: number;
  created_at: string;
  sent: boolean;
  region_id: string | null;
  payload: {
    id?: string;
    name?: string;
    order_number?: string;
    customer?: { first_name?: string };
    billing_address?: { first_name?: string };
    total_price?: string;
    current_total_price?: string;
    created_at?: string;
    tags?: string | string[];
    [key: string]: unknown;
  };
}

export default function PendingNotifications() {
  const { data: notifications, isLoading } = useQuery({
    queryKey: ["pending-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_notifications")
        .select("*")
        .eq("sent", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PendingNotification[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto p-6 space-y-6">
        <PageHeader
          title="Pending Notifications"
          description="Discord notifications queued to be sent at 9:00 AM HST"
          showEcosystem
        />
        <Card>
          <CardHeader>
            <CardTitle>Pending Discord Notifications</CardTitle>
            <CardDescription>
              Orders queued to be sent at 9:00 AM HST (19:00 UTC)
            </CardDescription>
          </CardHeader>
        <CardContent>
          {!notifications || notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending notifications
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {notifications.length} order{notifications.length !== 1 ? "s" : ""} pending
                </Badge>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Queued At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notification) => {
                    const orderName = notification.payload.name || notification.payload.order_number || `#${notification.payload.id}`;
                    const customerName = notification.payload.customer?.first_name || notification.payload.billing_address?.first_name || 'N/A';
                    const totalPrice = notification.payload.total_price || notification.payload.current_total_price || 'N/A';
                    const orderCreatedAt = notification.payload.created_at;
                    const regionIcon = notification.region_id === 'las_vegas' ? '🎰' : '🌺';
                    const regionLabel = notification.region_id === 'las_vegas' ? 'Las Vegas' : 'Hawaii';
                    
                    return (
                      <TableRow key={notification.id}>
                        <TableCell className="font-medium">
                          {orderName}
                        </TableCell>
                        <TableCell>{customerName}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{regionIcon} {regionLabel}</Badge>
                        </TableCell>
                        <TableCell>{totalPrice}</TableCell>
                        <TableCell>
                          {orderCreatedAt ? format(new Date(orderCreatedAt), "MMM d, yyyy h:mm a") : 'N/A'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(notification.created_at), "MMM d, yyyy h:mm a")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </main>
    </div>
  );
}
