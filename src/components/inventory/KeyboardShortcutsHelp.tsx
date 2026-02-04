import React from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const shortcuts = [
  { key: '/', description: 'Focus search' },
  { key: 'j / ↓', description: 'Move focus down' },
  { key: 'k / ↑', description: 'Move focus up' },
  { key: 'Space', description: 'Toggle selection' },
  { key: 'Enter', description: 'Open details' },
  { key: 's', description: 'Sync selected' },
  { key: 'p', description: 'Print selected' },
  { key: 'Shift+A', description: 'Select all' },
  { key: 'Esc', description: 'Clear selection' },
  { key: 'g', description: 'Go to top' },
  { key: 'Shift+G', description: 'Go to bottom' },
];

export function KeyboardShortcutsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Keyboard className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Shortcuts</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Keyboard Shortcuts</h4>
          <div className="grid gap-1.5">
            {shortcuts.map(({ key, description }) => (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{description}</span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
