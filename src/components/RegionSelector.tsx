import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";

interface RegionSelectorProps {
  regionId: string | null;
  regionName: string | null;
  className?: string;
}

export function RegionSelector({ regionId, regionName, className }: RegionSelectorProps) {
  if (!regionId || !regionName) {
    return (
      <Card className={`p-3 ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <MapPin className="w-4 h-4" />
          <span>No region assigned</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-medium">{regionName}</div>
          <div className="text-xs text-muted-foreground">Region</div>
        </div>
        <Badge variant="secondary">{regionId}</Badge>
      </div>
    </Card>
  );
}
