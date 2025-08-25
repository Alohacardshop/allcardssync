
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Store {
  key: string;
  name: string;
  vendor: string;
}

interface StoreSelectorProps {
  selectedStore: string | null;
  onStoreChange: (storeKey: string) => void;
}

export function StoreSelector({ selectedStore, onStoreChange }: StoreSelectorProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStores = async () => {
      try {
        const { data, error } = await supabase
          .from("shopify_stores")
          .select("key, name, vendor")
          .order("name");
        
        if (error) throw error;
        setStores(data || []);
      } catch (e) {
        console.error("Failed to load stores:", e);
      } finally {
        setLoading(false);
      }
    };

    loadStores();
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading stores...</div>;
  }

  return (
    <Select value={selectedStore || ""} onValueChange={onStoreChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select store" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.key} value={store.key}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
