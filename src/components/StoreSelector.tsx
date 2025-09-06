
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useStore } from "@/contexts/StoreContext";
import { Store, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useLocalStorageString } from "@/hooks/useLocalStorage";

interface StoreSelectorProps {
  className?: string;
}

export function StoreSelector({ className }: StoreSelectorProps) {
  const { selectedStore, setSelectedStore, availableStores, loadingStores, refreshStores } = useStore();
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

  if (loadingStores) {
    return (
      <div className={className}>
        <Select disabled>
          <SelectTrigger className="w-[200px]">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4" />
              <span>Loading stores...</span>
            </div>
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (availableStores.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2">
          <Select disabled>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4" />
                <span>No stores found</span>
              </div>
            </SelectTrigger>
          </Select>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={refreshStores}
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select value={selectedStore || ""} onValueChange={setSelectedStore}>
        <SelectTrigger className="w-[200px]">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4" />
            <SelectValue placeholder="Select store" />
          </div>
        </SelectTrigger>
        <SelectContent className="bg-background border-border z-50">
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
