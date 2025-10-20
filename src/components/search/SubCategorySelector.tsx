import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

interface SubCategorySelectorProps {
  mainCategory: string;
  selected: string[];
  onChange: (selected: string[]) => void;
}

export function SubCategorySelector({ mainCategory, selected, onChange }: SubCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: subCategories, isLoading } = useQuery({
    queryKey: ["sub-categories", mainCategory],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sub_categories")
        .select("*")
        .eq("main_category_id", mainCategory)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!mainCategory,
  });

  const filteredCategories = subCategories?.filter((cat) =>
    cat.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleCategory = (categoryName: string) => {
    if (selected.includes(categoryName)) {
      onChange(selected.filter((s) => s !== categoryName));
    } else {
      onChange([...selected, categoryName]);
    }
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            Sub-Categories
            {selected.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {selected.length}
              </Badge>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="Search categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : filteredCategories && filteredCategories.length > 0 ? (
                  filteredCategories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.includes(category.name)}
                        onCheckedChange={() => toggleCategory(category.name)}
                      />
                      <span className="text-sm">{category.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No categories found</p>
                )}
              </div>
            </ScrollArea>

            {selected.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {selected.length} selected
                </span>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected badges */}
      {selected.map((categoryName) => (
        <Badge key={categoryName} variant="secondary" className="gap-1">
          {categoryName}
          <X
            className="h-3 w-3 cursor-pointer hover:text-destructive"
            onClick={() => toggleCategory(categoryName)}
          />
        </Badge>
      ))}
    </div>
  );
}
