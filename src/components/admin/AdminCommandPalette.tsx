import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Package, Database, Home } from 'lucide-react';
import { ADMIN_NAV_SECTIONS, ADMIN_TOOLS, type AdminNavItem } from '@/config/navigation';
import { PATHS } from '@/routes/paths';

interface AdminCommand {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface AdminCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (sectionId: string) => void;
}

export function AdminCommandPalette({ 
  open, 
  onOpenChange,
  onNavigate 
}: AdminCommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const commands: AdminCommand[] = useMemo(() => {
    // Build navigation commands from centralized config
    const navCommands: AdminCommand[] = ADMIN_NAV_SECTIONS.map(section => ({
      id: `nav-${section.id}`,
      label: section.title,
      description: section.description,
      icon: section.icon,
      category: 'Navigation',
      action: () => onNavigate?.(section.id),
      keywords: section.keywords,
    }));

    // Build tool commands from centralized config
    const toolCommands: AdminCommand[] = ADMIN_TOOLS.map(tool => ({
      id: `tool-${tool.id}`,
      label: tool.title,
      description: tool.description,
      icon: tool.icon,
      category: 'Tools',
      action: () => navigate(tool.path),
      keywords: tool.keywords,
    }));

    // Quick actions for common app-level navigation
    const quickActions: AdminCommand[] = [
      {
        id: 'action-inventory',
        label: 'Go to Inventory',
        description: 'View inventory page',
        icon: Package,
        category: 'Quick Actions',
        action: () => navigate(PATHS.inventory),
        keywords: ['inventory', 'items'],
      },
      {
        id: 'action-batches',
        label: 'Go to Batches',
        description: 'View batch processing',
        icon: Package,
        category: 'Quick Actions',
        action: () => navigate(PATHS.batches),
        keywords: ['batches', 'processing'],
      },
      {
        id: 'action-import',
        label: 'Bulk Import',
        description: 'Import items in bulk',
        icon: Database,
        category: 'Quick Actions',
        action: () => navigate(PATHS.bulkImport),
        keywords: ['import', 'bulk', 'upload'],
      },
      {
        id: 'action-dashboard',
        label: 'Go to Dashboard',
        description: 'Return to main dashboard',
        icon: Home,
        category: 'Quick Actions',
        action: () => navigate(PATHS.dashboard),
        keywords: ['home', 'dashboard', 'main'],
      },
    ];

    return [...navCommands, ...toolCommands, ...quickActions];
  }, [navigate, onNavigate]);

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    
    const searchLower = search.toLowerCase();
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.category.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some(k => k.includes(searchLower))
    );
  }, [commands, search]);

  const groupedCommands = useMemo(() => {
    const grouped: Record<string, AdminCommand[]> = {};
    filteredCommands.forEach(cmd => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = [];
      }
      grouped[cmd.category].push(cmd);
    });
    return grouped;
  }, [filteredCommands]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  const executeCommand = (command: AdminCommand) => {
    command.action();
    onOpenChange(false);
    setSearch('');
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput 
        placeholder="Type a command or search..." 
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedCommands).map(([category, cmds], idx) => (
          <div key={category}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={category}>
              {cmds.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  onSelect={() => executeCommand(cmd)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <cmd.icon className="w-4 h-4" />
                  <div className="flex-1">
                    <div className="font-medium">{cmd.label}</div>
                    {cmd.description && (
                      <div className="text-xs text-muted-foreground">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
      <div className="border-t border-border p-2 text-xs text-muted-foreground text-center">
        Press <kbd className="px-1.5 py-0.5 bg-muted rounded">⌘</kbd> + <kbd className="px-1.5 py-0.5 bg-muted rounded">K</kbd> to toggle
      </div>
    </CommandDialog>
  );
}
