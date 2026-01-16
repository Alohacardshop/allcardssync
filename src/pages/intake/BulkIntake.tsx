import { TCGPlayerBulkImport } from "@/components/TCGPlayerBulkImport";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function BulkIntake() {
  const navigate = useNavigate();
  
  return (
    <div className="container mx-auto px-4 py-6">
      <PageHeader
        title="Bulk Import"
        description="Import multiple raw cards from CSV or paste TCGPlayer data"
        showEcosystem
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/intake')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Intake
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <TCGPlayerBulkImport />
        </CardContent>
      </Card>
    </div>
  );
}
