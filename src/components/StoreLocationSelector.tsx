
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { StoreLocationPicker } from "./StoreLocationPicker";
import { Store } from "lucide-react";

interface StoreLocationSelectorProps {
  className?: string;
  showSetDefault?: boolean;
}

export function StoreLocationSelector({ className, showSetDefault = true }: StoreLocationSelectorProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Store className="h-4 w-4" />
            Store & Location
          </Label>
          
          <StoreLocationPicker showSetDefault={showSetDefault} />
        </div>
      </CardContent>
    </Card>
  );
}
