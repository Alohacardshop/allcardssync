import { useState, useEffect } from "react"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { 
  Search, 
  Plus, 
  Save, 
  Copy, 
  Trash2, 
  RefreshCw,
  Download,
  Upload,
  Home,
  Package,
  Archive,
  Settings
} from "lucide-react"

interface Shortcut {
  keys: string[]
  description: string
  category: string
  icon?: React.ReactNode
}

const shortcuts: Shortcut[] = [
  // Navigation
  { keys: ['G', 'H'], description: 'Go to Dashboard', category: 'Navigation', icon: <Home className="h-4 w-4" /> },
  { keys: ['G', 'I'], description: 'Go to Inventory', category: 'Navigation', icon: <Package className="h-4 w-4" /> },
  { keys: ['G', 'B'], description: 'Go to Batches', category: 'Navigation', icon: <Archive className="h-4 w-4" /> },
  { keys: ['G', 'A'], description: 'Go to Admin', category: 'Navigation', icon: <Settings className="h-4 w-4" /> },
  
  // Actions
  { keys: ['Ctrl', 'K'], description: 'Open command palette', category: 'Actions', icon: <Search className="h-4 w-4" /> },
  { keys: ['Ctrl', 'N'], description: 'Add new item', category: 'Actions', icon: <Plus className="h-4 w-4" /> },
  { keys: ['Ctrl', 'S'], description: 'Save current form', category: 'Actions', icon: <Save className="h-4 w-4" /> },
  { keys: ['Ctrl', 'D'], description: 'Duplicate selected item', category: 'Actions', icon: <Copy className="h-4 w-4" /> },
  { keys: ['Delete'], description: 'Delete selected items', category: 'Actions', icon: <Trash2 className="h-4 w-4" /> },
  { keys: ['F5'], description: 'Refresh current view', category: 'Actions', icon: <RefreshCw className="h-4 w-4" /> },
  
  // Selection
  { keys: ['Ctrl', 'A'], description: 'Select all items', category: 'Selection' },
  { keys: ['Shift', 'Click'], description: 'Select range of items', category: 'Selection' },
  { keys: ['Ctrl', 'Click'], description: 'Toggle item selection', category: 'Selection' },
  { keys: ['Escape'], description: 'Clear selection', category: 'Selection' },
  
  // Batch Operations
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Print selected labels', category: 'Batch Operations' },
  { keys: ['Ctrl', 'Shift', 'I'], description: 'Send to inventory', category: 'Batch Operations' },
  { keys: ['Ctrl', 'E'], description: 'Export selected items', category: 'Batch Operations', icon: <Download className="h-4 w-4" /> },
  { keys: ['Ctrl', 'U'], description: 'Import items', category: 'Batch Operations', icon: <Upload className="h-4 w-4" /> },
  
  // Search & Filter
  { keys: ['/'], description: 'Focus search input', category: 'Search & Filter', icon: <Search className="h-4 w-4" /> },
  { keys: ['Ctrl', 'F'], description: 'Open advanced filters', category: 'Search & Filter' },
  { keys: ['Ctrl', 'Shift', 'F'], description: 'Clear all filters', category: 'Search & Filter' },
  
  // General
  { keys: ['?'], description: 'Show this help dialog', category: 'General' },
  { keys: ['Ctrl', 'Z'], description: 'Undo last action', category: 'General' },
  { keys: ['Ctrl', 'Y'], description: 'Redo last action', category: 'General' },
]

interface KeyboardShortcutsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  const categories = [...new Set(shortcuts.map(s => s.category))]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⌨️ Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription>
            Use these shortcuts to navigate and interact with the application more efficiently.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {categories.map((category) => (
            <Card key={category}>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">
                  {category}
                </h3>
                <div className="space-y-3">
                  {shortcuts
                    .filter(shortcut => shortcut.category === category)
                    .map((shortcut, index) => (
                      <div key={index} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {shortcut.icon}
                          <span className="text-sm truncate">{shortcut.description}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {shortcut.keys.map((key, keyIndex) => (
                            <div key={keyIndex} className="flex items-center">
                              <Badge variant="outline" className="text-xs px-2 py-1 font-mono">
                                {key}
                              </Badge>
                              {keyIndex < shortcut.keys.length - 1 && (
                                <span className="mx-1 text-muted-foreground">+</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Pro tip:</strong> Press <Badge variant="outline" className="mx-1">?</Badge> at any time to open this help dialog.
            Most shortcuts work globally, but some are context-specific to the current page.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Global keyboard shortcut hook
export function useKeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || 
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement) {
        return
      }

      const { key, ctrlKey, metaKey, shiftKey } = event
      const modifier = ctrlKey || metaKey

      // Show help dialog
      if (key === '?' && !modifier && !shiftKey) {
        event.preventDefault()
        setShowHelp(true)
        return
      }

      // Navigation shortcuts
      if (key === 'g' && !modifier) {
        // Wait for next key press for navigation
        const timeout = setTimeout(() => {
          // Clear if no second key pressed
        }, 1000)

        const handleSecondKey = (secondEvent: KeyboardEvent) => {
          clearTimeout(timeout)
          document.removeEventListener('keydown', handleSecondKey)
          
          switch (secondEvent.key) {
            case 'h':
              window.location.href = '/'
              break
            case 'i':
              window.location.href = '/inventory'
              break
            case 'b':
              window.location.href = '/batches'
              break
            case 'a':
              window.location.href = '/admin'
              break
          }
        }

        document.addEventListener('keydown', handleSecondKey)
        return
      }

      // Search focus
      if (key === '/' && !modifier) {
        event.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="search" i]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
        return
      }

      // Command palette
      if (key === 'k' && modifier && !shiftKey) {
        event.preventDefault()
        // Trigger command palette (would integrate with existing command palette)
        console.log('Open command palette')
        return
      }

      // Refresh
      if (key === 'F5') {
        event.preventDefault()
        window.location.reload()
        return
      }

      // Select all
      if (key === 'a' && modifier && !shiftKey) {
        event.preventDefault()
        // Trigger select all (would integrate with existing selection logic)
        document.dispatchEvent(new CustomEvent('shortcut:select-all'))
        return
      }

      // Clear selection
      if (key === 'Escape' && !modifier) {
        document.dispatchEvent(new CustomEvent('shortcut:clear-selection'))
        return
      }

      // Delete
      if (key === 'Delete' && !modifier) {
        event.preventDefault()
        document.dispatchEvent(new CustomEvent('shortcut:delete-selected'))
        return
      }

      // Batch operations
      if (modifier && shiftKey) {
        switch (key) {
          case 'P':
            event.preventDefault()
            document.dispatchEvent(new CustomEvent('shortcut:print-labels'))
            break
          case 'I':
            event.preventDefault()
            document.dispatchEvent(new CustomEvent('shortcut:send-to-inventory'))
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return { showHelp, setShowHelp }
}