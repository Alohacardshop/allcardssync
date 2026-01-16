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
  payload: {
    id: string;
    name: string;
    customer_name: string;
    total_price: string;
    created_at: string;
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
                    <TableHead>Total</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Queued At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="font-medium">
                        {notification.payload.name}
                      </TableCell>
                      <TableCell>{notification.payload.customer_name}</TableCell>
                      <TableCell>{notification.payload.total_price}</TableCell>
                      <TableCell>
                        {format(new Date(notification.payload.created_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(notification.created_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                    </TableRow>
                  ))}
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
