import { GradedCardIntake } from "@/components/GradedCardIntake";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function GradedIntake() {
  const navigate = useNavigate();
  
  return (
    <div className="container mx-auto px-4 py-6">
      <PageHeader
        title="Graded Card Intake"
        description="Scan or enter certificate numbers for PSA and CGC graded cards"
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
          <GradedCardIntake />
        </CardContent>
      </Card>
    </div>
  );
}
