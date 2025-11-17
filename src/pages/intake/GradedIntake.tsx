import { GradedCardIntake } from "@/components/GradedCardIntake";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GradedIntake() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Graded Card Intake</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Add Graded Cards</CardTitle>
            <CardDescription>Scan or enter certificate numbers for PSA and CGC graded cards</CardDescription>
          </CardHeader>
          <CardContent>
            <GradedCardIntake />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
