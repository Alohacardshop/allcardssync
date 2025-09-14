
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/contexts/StoreContext";
import { Store } from "lucide-react";

interface StoreSelectorProps {
  className?: string;
}

export function StoreSelector({ className }: StoreSelectorProps) {
  const { assignedStore, assignedStoreName } = useStore();

  // Simply display the assigned store - no selection needed
  if (!assignedStore) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="h-4 w-4" />
          <span>No store assigned</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <Badge variant="outline" className="flex items-center gap-1">
          {assignedStoreName || assignedStore}
        </Badge>
      </div>
    </div>
  );
}
