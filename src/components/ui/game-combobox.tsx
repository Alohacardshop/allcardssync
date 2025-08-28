import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Game {
  id: string;
  name: string;
}

type Props = {
  value: string | undefined;
  onChange: (value: string) => void;
  items: Game[];
  disabled?: boolean;
  placeholder?: string;
  inputPlaceholder?: string;
};

export function GameCombobox({
  value,
  onChange,
  items,
  disabled,
  placeholder = "Select game",
  inputPlaceholder = "Search games…",
}: Props) {
  const [open, setOpen] = React.useState(false);

  const selectedGame = items.find(game => game.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          {selectedGame ? selectedGame.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0 z-[9999] bg-background" align="start">
        <Command>
          <CommandInput placeholder={inputPlaceholder} />
          <CommandList>
            <CommandEmpty>No games found.</CommandEmpty>
            <CommandGroup>
              {items.map((game) => (
                <CommandItem
                  key={game.id}
                  value={`${game.id} ${game.name}`}
                  onSelect={() => {
                    onChange(game.id);
                    setOpen(false);
                  }}
                >
                  <Check 
                    className={cn(
                      "mr-2 h-4 w-4", 
                      value === game.id ? "opacity-100" : "opacity-0"
                    )} 
                  />
                  <div className="flex items-center justify-between w-full">
                    <span>{game.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {game.id}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}