import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Settings,
  Database,
  ShoppingCart,
  Users,
  Server,
  Wrench,
  BarChart3,
  Package,
  Tag,
  Home,
  RefreshCw,
  FileText,
  Shield,
  Activity
} from 'lucide-react';

interface AdminCommand {
  id: string;
  label: string;
  description?: string;
  icon: any;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface AdminCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (section: string) => void;
}

export function AdminCommandPalette({ 
  open, 
  onOpenChange,
  onNavigate 
}: AdminCommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const commands: AdminCommand[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-overview',
      label: 'Overview',
      description: 'System overview and quick actions',
      icon: BarChart3,
      category: 'Navigation',
      action: () => onNavigate?.('overview'),
      keywords: ['dashboard', 'home', 'stats']
    },
    {
      id: 'nav-stores',
      label: 'Store Management',
      description: 'Shopify integration and sync',
      icon: ShoppingCart,
      category: 'Navigation',
      action: () => onNavigate?.('stores'),
      keywords: ['shopify', 'integration', 'sync']
    },
    {
      id: 'nav-queue',
      label: 'Queue Management',
      description: 'Monitor queue health and settings',
      icon: Package,
      category: 'Navigation',
      action: () => onNavigate?.('queue'),
      keywords: ['queue', 'sync', 'health']
    },
    {
      id: 'nav-hardware',
      label: 'Hardware Test',
      description: 'Test printers and connectivity',
      icon: Wrench,
      category: 'Navigation',
      action: () => onNavigate?.('hardware'),
      keywords: ['printer', 'test', 'zebra']
    },
    {
      id: 'nav-catalog',
      label: 'Catalog & Data',
      description: 'TCG database settings',
      icon: Database,
      category: 'Navigation',
      action: () => onNavigate?.('catalog'),
      keywords: ['tcg', 'database', 'catalog']
    },
    {
      id: 'nav-users',
      label: 'User Management',
      description: 'Manage user assignments',
      icon: Users,
      category: 'Navigation',
      action: () => onNavigate?.('users'),
      keywords: ['users', 'permissions', 'access']
    },
    {
      id: 'nav-categories',
      label: 'Category Management',
      description: 'Manage inventory categories',
      icon: Tag,
      category: 'Navigation',
      action: () => onNavigate?.('categories'),
      keywords: ['categories', 'taxonomy']
    },
    {
      id: 'nav-system',
      label: 'System & Logs',
      description: 'View system logs',
      icon: Server,
      category: 'Navigation',
      action: () => onNavigate?.('system'),
      keywords: ['logs', 'debug', 'errors']
    },

    // Quick Actions
    {
      id: 'action-inventory',
      label: 'Go to Inventory',
      description: 'View inventory page',
      icon: Package,
      category: 'Quick Actions',
      action: () => navigate('/inventory'),
      keywords: ['inventory', 'items']
    },
    {
      id: 'action-batches',
      label: 'Go to Batches',
      description: 'View batch processing',
      icon: Package,
      category: 'Quick Actions',
      action: () => navigate('/batches'),
      keywords: ['batches', 'processing']
    },
    {
      id: 'action-import',
      label: 'Bulk Import',
      description: 'Import items in bulk',
      icon: Database,
      category: 'Quick Actions',
      action: () => navigate('/bulk-import'),
      keywords: ['import', 'bulk', 'upload']
    },

    // Settings
    {
      id: 'settings-shopify',
      label: 'Shopify Configuration',
      description: 'Configure Shopify integration',
      icon: Settings,
      category: 'Settings',
      action: () => onNavigate?.('stores'),
      keywords: ['shopify', 'config', 'api']
    },
    {
      id: 'settings-tcg',
      label: 'TCG Database Settings',
      description: 'Configure TCG database',
      icon: Database,
      category: 'Settings',
      action: () => onNavigate?.('catalog'),
      keywords: ['tcg', 'database', 'justtcg']
    }
  ], [navigate, onNavigate]);

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