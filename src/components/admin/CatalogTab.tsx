import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import CatalogResetRebuild from './CatalogResetRebuild';
import CardsView from './CardsView';
import SetsList from './SetsList';
import { SystemHealthCard } from './SystemHealthCard';

const CatalogTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Catalog Management</h2>
        <p className="text-muted-foreground">
          Manage catalog data and browse existing card collections
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Sync functionality has been removed. This application will connect to an external TCG database service for catalog data.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="browse">Browse Data</TabsTrigger>
          <TabsTrigger value="reset">Reset Tools</TabsTrigger>
          <TabsTrigger value="health">Health & Monitor</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Browse Catalog Data</CardTitle>
              <CardDescription>
                View existing card and set data in the catalog
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Card and set browsing will be implemented to use external TCG database service.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reset" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone — Reset Catalog</CardTitle>
              <CardDescription>
                Clear catalog data. Use with caution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Reset functionality will be updated for external TCG database integration.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-6">
          <SystemHealthCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CatalogTab;