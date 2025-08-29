
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/contexts/StoreContext";
import { Store } from "lucide-react";

interface StoreSelectorProps {
  className?: string;
}

export function StoreSelector({ className }: StoreSelectorProps) {
  const { selectedStore, setSelectedStore, availableStores } = useStore();

  return (
    <div className={className}>
      <Select value={selectedStore || ""} onValueChange={setSelectedStore}>
        <SelectTrigger className="w-[200px]">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            <SelectValue placeholder="Select store" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {availableStores.map((store) => (
            <SelectItem key={store.key} value={store.key}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
