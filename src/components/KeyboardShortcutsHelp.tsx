import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface ShortcutItem {
  keys: string;
  description: string;
  category: string;
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts: ShortcutItem[] = [
  { keys: 'Ctrl+S', description: 'Save current form', category: 'General' },
  { keys: 'Ctrl+P', description: 'Open print dialog', category: 'General' },
  { keys: 'Ctrl+/', description: 'Show shortcuts help', category: 'General' },
  { keys: 'ESC', description: 'Close any open dialog', category: 'General' },
  { keys: 'Ctrl+K', description: 'Quick search', category: 'General' },
  { keys: 'G H', description: 'Go to Home/Dashboard', category: 'Navigation' },
  { keys: 'G I', description: 'Go to Inventory', category: 'Navigation' },
  { keys: 'G B', description: 'Go to Batches', category: 'Navigation' },
  { keys: 'G L', description: 'Go to Labels', category: 'Navigation' },
  { keys: 'Tab', description: 'Navigate through form fields', category: 'Forms' },
  { keys: 'Enter', description: 'Submit form or confirm action', category: 'Forms' },
];

export function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-6">
            {Object.entries(groupedShortcuts).map(([category, items]) => (
              <div key={category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  {category}
                </h3>
                <div className="space-y-2">
                  {items.map((shortcut) => (
                    <div key={shortcut.keys} className="flex items-center justify-between">
                      <span className="text-sm">{shortcut.description}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {shortcut.keys}
                      </Badge>
                    </div>
                  ))}
                </div>
                <Separator className="mt-4" />
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="text-xs text-muted-foreground mt-4">
          Pro tip: Press <Badge variant="outline" className="mx-1">Ctrl+/</Badge> anytime to see these shortcuts
        </div>
      </DialogContent>
    </Dialog>
  );
}