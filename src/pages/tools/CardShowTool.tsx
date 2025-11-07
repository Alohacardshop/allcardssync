import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CardShowDashboard } from "@/components/card-show-tool/CardShowDashboard";
import { CardShowAddByCert } from "@/components/card-show-tool/CardShowAddByCert";
import { CardShowAddItems } from "@/components/card-show-tool/CardShowAddItems";
import { CardShowInventory } from "@/components/card-show-tool/CardShowInventory";
import { CardShowShows } from "@/components/card-show-tool/CardShowShows";
import { CardShowLocations } from "@/components/card-show-tool/CardShowLocations";
import { CardShowTransactions } from "@/components/card-show-tool/CardShowTransactions";
import { CardShowSessions } from "@/components/card-show-tool/CardShowSessions";
import { CardShowSettings } from "@/components/card-show-tool/CardShowSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export default function CardShowTool() {
  const { user, isAdmin, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center gap-2 mb-6">
          <TabsList className="flex-1">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="add">Add Items</TabsTrigger>
            <TabsTrigger value="inventory">Show Inventory</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Manage
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card z-50">
              <DropdownMenuItem onClick={() => setActiveTab("shows")}>
                Manage Shows
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setActiveTab("locations")}>
                Show Locations
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveTab("sessions")}>
                    ALT Sessions
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Tools
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card z-50">
              <DropdownMenuItem onClick={() => setActiveTab("lookup")}>
                Lookup by Cert
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setActiveTab("settings")}>
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="dashboard" className="mt-6">
          <CardShowDashboard />
        </TabsContent>

        <TabsContent value="lookup" className="mt-6">
          <CardShowAddByCert />
        </TabsContent>

        <TabsContent value="add" className="mt-6">
          <CardShowAddItems />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <CardShowInventory />
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
