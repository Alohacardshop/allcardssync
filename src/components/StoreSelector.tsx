
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/contexts/StoreContext";
import { Store } from "lucide-react";
import { useEffect } from "react";
import { useLocalStorageString } from "@/hooks/useLocalStorage";

interface StoreSelectorProps {
  className?: string;
}

export function StoreSelector({ className }: StoreSelectorProps) {
  const { selectedStore, setSelectedStore, availableStores } = useStore();
  const [lastSelectedStore, setLastSelectedStore] = useLocalStorageString("last-store", "");

  // Auto-select single available store or restore last selection
  useEffect(() => {
    if (availableStores.length === 1 && !selectedStore) {
      // Auto-select if only one store available
      setSelectedStore(availableStores[0].key);
      setLastSelectedStore(availableStores[0].key);
    } else if (availableStores.length > 1 && !selectedStore && lastSelectedStore) {
      // Restore last selection if it's still available
      const lastStoreExists = availableStores.some(store => store.key === lastSelectedStore);
      if (lastStoreExists) {
        setSelectedStore(lastSelectedStore);
      }
    }
  }, [availableStores, selectedStore, lastSelectedStore, setSelectedStore, setLastSelectedStore]);

  // Save selection to local storage when changed
  useEffect(() => {
    if (selectedStore) {
      setLastSelectedStore(selectedStore);
    }
  }, [selectedStore, setLastSelectedStore]);

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
