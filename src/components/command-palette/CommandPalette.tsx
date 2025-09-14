import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Download, 
  Upload, 
  Settings, 
  Home,
  Package,
  BarChart3,
  FileText,
  Printer,
  Users,
  Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<any>;
  shortcut?: string;
  category: 'Navigation' | 'Actions' | 'Data' | 'Admin';
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const commands: Command[] = useMemo(() => [
    // Navigation
    {
      id: 'nav-home',
      label: 'Go to Dashboard',
      description: 'Navigate to the main dashboard',
      icon: Home,
      shortcut: 'G H',
      category: 'Navigation',
      action: () => navigate('/'),
      keywords: ['dashboard', 'home', 'main']
    },
    {
      id: 'nav-inventory',
      label: 'Go to Inventory',
      description: 'View and manage inventory items',
      icon: Package,
      shortcut: 'G I',
      category: 'Navigation',
      action: () => navigate('/inventory'),
      keywords: ['inventory', 'items', 'stock']
    },
    {
      id: 'nav-batches',
      label: 'Go to Batches',
      description: 'Manage intake batches',
      icon: Database,
      shortcut: 'G B',
      category: 'Navigation',
      action: () => navigate('/batches'),
      keywords: ['batches', 'intake', 'lots']
    },
    {
      id: 'nav-analytics',
      label: 'Go to Analytics',
      description: 'View reports and analytics',
      icon: BarChart3,
      shortcut: 'G A',
      category: 'Navigation',
      action: () => navigate('/admin'),
      keywords: ['analytics', 'reports', 'charts', 'data']
    },
    {
      id: 'nav-admin',
      label: 'Go to Admin',
      description: 'Access admin settings',
      icon: Settings,
      shortcut: 'G S',
      category: 'Navigation',
      action: () => navigate('/admin'),
      keywords: ['admin', 'settings', 'configuration']
    },

    // Actions
    {
      id: 'action-new-item',
      label: 'Add New Item',
      description: 'Create a new inventory item',
      icon: Plus,
      shortcut: 'N',
      category: 'Actions',
      action: () => {
        toast.success('Opening new item dialog...');
        // Trigger new item dialog
        window.dispatchEvent(new CustomEvent('open-new-item-dialog'));
      },
      keywords: ['new', 'add', 'create', 'item']
    },
    {
      id: 'action-search',
      label: 'Search Items',
      description: 'Search through inventory',
      icon: Search,
      shortcut: '/',
      category: 'Actions',
      action: () => {
        // Focus search input
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      },
      keywords: ['search', 'find', 'filter']
    },
    {
      id: 'action-print-labels',
      label: 'Print Labels',
      description: 'Print labels for selected items',
      icon: Printer,
      shortcut: 'P',
      category: 'Actions',
      action: () => {
        toast.success('Opening print dialog...');
        window.dispatchEvent(new CustomEvent('print-labels'));
      },
      keywords: ['print', 'labels', 'barcode']
    },

    // Data
    {
      id: 'data-export-csv',
      label: 'Export to CSV',
      description: 'Export current data to CSV file',
      icon: Download,
      category: 'Data',
      action: () => {
        toast.success('Exporting to CSV...');
        window.dispatchEvent(new CustomEvent('export-csv'));
      },
      keywords: ['export', 'csv', 'download', 'data']
    },
    {
      id: 'data-import',
      label: 'Import Data',
      description: 'Import data from file',
      icon: Upload,
      category: 'Data',
      action: () => {
        navigate('/bulk-import');
      },
      keywords: ['import', 'upload', 'bulk', 'data']
    },
    {
      id: 'data-backup',
      label: 'Backup Data',
      description: 'Create a backup of all data',
      icon: Database,
      category: 'Data',
      action: () => {
        toast.success('Creating backup...');
        window.dispatchEvent(new CustomEvent('create-backup'));
      },
      keywords: ['backup', 'export', 'save']
    }
  ], [navigate]);

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    
    const searchTerm = search.toLowerCase();
    return commands.filter(command => 
      command.label.toLowerCase().includes(searchTerm) ||
      command.description?.toLowerCase().includes(searchTerm) ||
      command.keywords?.some(keyword => keyword.includes(searchTerm)) ||
      command.category.toLowerCase().includes(searchTerm)
    );
  }, [commands, search]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(command => {
      if (!groups[command.category]) {
        groups[command.category] = [];
      }
      groups[command.category].push(command);
    });
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < filteredCommands.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : prev);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const command = filteredCommands[selectedIndex];
      if (command) {
        command.action();
        onOpenChange(false);
      }
    }
  };

  const executeCommand = (command: Command) => {
    command.action();
    onOpenChange(false);
  };

  let commandIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="flex items-center border-b px-4 py-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="border-0 p-0 text-base shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0"
            autoFocus
          />
          <Badge variant="outline" className="ml-2 text-xs">
            ESC
          </Badge>
        </div>

        <ScrollArea className="max-h-96">
          {Object.keys(groupedCommands).length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No commands found for "{search}"
            </div>
          ) : (
            <div className="p-2">
              {Object.entries(groupedCommands).map(([category, categoryCommands]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {categoryCommands.map((command) => {
                      const currentIndex = commandIndex++;
                      const isSelected = currentIndex === selectedIndex;
                      
                      return (
                        <button
                          key={command.id}
                          onClick={() => executeCommand(command)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm rounded-md transition-colors ${
                            isSelected 
                              ? 'bg-accent text-accent-foreground' 
                              : 'hover:bg-accent/50'
                          }`}
                        >
                          <div className="flex items-center">
                            <command.icon className="mr-3 h-4 w-4" />
                            <div>
                              <div className="font-medium">{command.label}</div>
                              {command.description && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {command.description}
                                </div>
                              )}
                            </div>
                          </div>
                          {command.shortcut && (
                            <Badge variant="outline" className="text-xs">
                              {command.shortcut}
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          Use ↑↓ to navigate, Enter to select, ESC to close
        </div>
      </DialogContent>
    </Dialog>
  );
}