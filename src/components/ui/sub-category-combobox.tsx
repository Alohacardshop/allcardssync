import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SubCategoryComboboxProps {
  mainCategory: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SubCategoryCombobox({ mainCategory, value, onChange, disabled }: SubCategoryComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const { data: subCategories, isLoading } = useQuery({
    queryKey: ["sub-categories-combobox", mainCategory],
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

  const selectedCategory = subCategories?.find((cat) => cat.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || !mainCategory || isLoading}
        >
          {isLoading ? (
            "Loading..."
          ) : selectedCategory ? (
            selectedCategory.name
          ) : (
            "Select sub-category..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search sub-categories..." />
          <CommandEmpty>No sub-category found.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {subCategories?.map((category) => (
              <CommandItem
                key={category.id}
                value={category.name}
                onSelect={(currentValue) => {
                  onChange(currentValue === value ? "" : currentValue);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === category.name ? "opacity-100" : "opacity-0"
                  )}
                />
                {category.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
