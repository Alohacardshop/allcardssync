import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TagCount } from '@/hooks/useShopifyTags';

interface TagFilterDropdownProps {
  tags: TagCount[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  isLoading?: boolean;
}

export const TagFilterDropdown = React.memo(({
  tags,
  selectedTags,
  onTagsChange,
  isLoading = false,
}: TagFilterDropdownProps) => {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  // Filter tags based on search
  const filteredTags = useMemo(() => {
    if (!searchValue) return tags;
    const search = searchValue.toLowerCase();
    return tags.filter(t => t.tag.toLowerCase().includes(search));
  }, [tags, searchValue]);

  const handleSelect = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onTagsChange(selectedTags.filter(t => t !== tag));
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTagsChange([]);
  };

  // Display text for the button
  const displayText = useMemo(() => {
    if (selectedTags.length === 0) return 'All Tags';
    if (selectedTags.length === 1) return selectedTags[0];
    return `${selectedTags.length} tags`;
  }, [selectedTags]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[180px] justify-between"
          disabled={isLoading}
        >
          <div className="flex items-center gap-2 truncate">
            <Tag className="h-4 w-4 shrink-0" />
            <span className="truncate">{displayText}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {selectedTags.length > 0 && (
              <X 
                className="h-4 w-4 opacity-50 hover:opacity-100 cursor-pointer" 
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Search tags..." 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup>
              {filteredTags.map((tagItem) => (
                <CommandItem
                  key={tagItem.tag}
                  value={tagItem.tag}
                  onSelect={() => handleSelect(tagItem.tag)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selectedTags.includes(tagItem.tag) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="capitalize">{tagItem.tag}</span>
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {tagItem.count}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        
        {/* Selected tags preview */}
        {selectedTags.length > 0 && (
          <div className="border-t p-2 flex flex-wrap gap-1">
            {selectedTags.map(tag => (
              <Badge 
                key={tag} 
                variant="default"
                className="cursor-pointer"
                onClick={() => handleSelect(tag)}
              >
                {tag}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

TagFilterDropdown.displayName = 'TagFilterDropdown';
