import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardShowDashboard } from "@/components/card-show-tool/CardShowDashboard";
import { CardShowAddByCert } from "@/components/card-show-tool/CardShowAddByCert";
import { CardShowAddItems } from "@/components/card-show-tool/CardShowAddItems";
import { CardShowShows } from "@/components/card-show-tool/CardShowShows";
import { CardShowLocations } from "@/components/card-show-tool/CardShowLocations";
import { CardShowTransactions } from "@/components/card-show-tool/CardShowTransactions";
import { CardShowSessions } from "@/components/card-show-tool/CardShowSessions";
import { CardShowSettings } from "@/components/card-show-tool/CardShowSettings";

export default function CardShowTool() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Show Tools</h1>
        <p className="text-muted-foreground">Manage show inventory, transactions, and locations</p>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-8' : 'grid-cols-7'}`}>
          <TabsTrigger value="dashboard">Show Dashboard</TabsTrigger>
          <TabsTrigger value="lookup">Lookup Cert</TabsTrigger>
          <TabsTrigger value="add">Add Items</TabsTrigger>
          <TabsTrigger value="transactions">Show Transactions</TabsTrigger>
          <TabsTrigger value="shows">Manage Shows</TabsTrigger>
          <TabsTrigger value="locations">Show Locations</TabsTrigger>
          {isAdmin && <TabsTrigger value="sessions">Sessions</TabsTrigger>}
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <CardShowDashboard />
        </TabsContent>

        <TabsContent value="lookup" className="mt-6">
          <CardShowAddByCert />
        </TabsContent>

        <TabsContent value="add" className="mt-6">
          <CardShowAddItems />
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <CardShowTransactions />
        </TabsContent>

        <TabsContent value="shows" className="mt-6">
          <CardShowShows />
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <CardShowLocations />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="sessions" className="mt-6">
            <CardShowSessions />
          </TabsContent>
        )}

        <TabsContent value="settings" className="mt-6">
          <CardShowSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
