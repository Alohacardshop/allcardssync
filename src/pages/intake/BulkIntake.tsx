import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BulkIntake() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Bulk Import</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>TCGPlayer Bulk Import</CardTitle>
            <CardDescription>Import multiple raw cards from CSV or paste TCGPlayer data</CardDescription>
          </CardHeader>
          <CardContent>
            <TCGPlayerBulkImport />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
