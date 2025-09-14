import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface ShortcutHandler {
  keys: string;
  description: string;
  handler: () => void;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

export function useKeyboardShortcuts() {
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const navigate = useNavigate();

  const shortcuts: ShortcutHandler[] = [
    // Global shortcuts
    {
      keys: 'ctrl+k,cmd+k',
      description: 'Open command palette',
      handler: () => setShowCommandPalette(true),
      preventDefault: true,
    },
    {
      keys: '?',
      description: 'Show keyboard shortcuts',
      handler: () => setShowHelp(true),
      preventDefault: true,
    },
    {
      keys: 'escape',
      description: 'Close dialogs/overlays',
      handler: () => {
        setShowCommandPalette(false);
        setShowHelp(false);
        // Dispatch escape event for other components
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      },
    },

    // Navigation shortcuts
    {
      keys: 'g,h',
      description: 'Go to home/dashboard',
      handler: () => navigate('/'),
    },
    {
      keys: 'g,i',
      description: 'Go to inventory',
      handler: () => navigate('/inventory'),
    },
    {
      keys: 'g,b',
      description: 'Go to batches',
      handler: () => navigate('/batches'),
    },
    {
      keys: 'g,a',
      description: 'Go to analytics',
      handler: () => navigate('/admin'),
    },
    {
      keys: 'g,s',
      description: 'Go to settings',
      handler: () => navigate('/admin'),
    },

    // Action shortcuts
    {
      keys: 'n',
      description: 'New item',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'new-item' } 
        }));
      },
      preventDefault: true,
    },
    {
      keys: '/',
      description: 'Focus search',
      handler: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        } else {
          window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
            detail: { action: 'focus-search' } 
          }));
        }
      },
      preventDefault: true,
    },
    {
      keys: 's',
      description: 'Save/sync',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'save' } 
        }));
      },
      preventDefault: true,
    },
    {
      keys: 'e',
      description: 'Edit selected',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'edit' } 
        }));
      },
      preventDefault: true,
    },
    {
      keys: 'delete,backspace',
      description: 'Delete selected',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'delete' } 
        }));
      },
      preventDefault: true,
    },
    {
      keys: 'p',
      description: 'Print labels',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'print' } 
        }));
      },
      preventDefault: true,
    },

    // Selection shortcuts
    {
      keys: 'ctrl+a,cmd+a',
      description: 'Select all',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'select-all' } 
        }));
      },
      preventDefault: true,
    },
    {
      keys: 'ctrl+d,cmd+d',
      description: 'Deselect all',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'deselect-all' } 
        }));
      },
      preventDefault: true,
    },

    // Export shortcuts
    {
      keys: 'ctrl+e,cmd+e',
      description: 'Export data',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'export' } 
        }));
      },
      preventDefault: true,
    },

    // Refresh
    {
      keys: 'r',
      description: 'Refresh data',
      handler: () => {
        window.dispatchEvent(new CustomEvent('keyboard-shortcut', { 
          detail: { action: 'refresh' } 
        }));
      },
      preventDefault: true,
    },
  ];

  const parseKeyCombo = (keys: string): string[] => {
    return keys.toLowerCase().split(',').map(k => k.trim());
  };

  const isModifierKey = (key: string): boolean => {
    return ['ctrl', 'cmd', 'alt', 'shift', 'meta'].some(mod => key.includes(mod));
  };

  const matchesKeyCombo = (event: KeyboardEvent, combo: string): boolean => {
    const keys = combo.split('+').map(k => k.trim().toLowerCase());
    const eventKey = event.key.toLowerCase();
    
    // Check if all required keys are pressed
    for (const key of keys) {
      switch (key) {
        case 'ctrl':
          if (!event.ctrlKey) return false;
          break;
        case 'cmd':
        case 'meta':
          if (!event.metaKey) return false;
          break;
        case 'alt':
          if (!event.altKey) return false;
          break;
        case 'shift':
          if (!event.shiftKey) return false;
          break;
        default:
          if (eventKey !== key) return false;
      }
    }
    
    return true;
  };

  const shouldIgnoreEvent = (event: KeyboardEvent): boolean => {
    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    
    // Ignore shortcuts when typing in input fields
    if (['input', 'textarea', 'select'].includes(tagName)) {
      // Allow some shortcuts even in input fields
      const allowedInInputs = ['escape', 'ctrl+k', 'cmd+k'];
      const eventCombo = [
        event.ctrlKey && 'ctrl',
        event.metaKey && 'cmd',
        event.altKey && 'alt',
        event.shiftKey && 'shift',
        event.key.toLowerCase()
      ].filter(Boolean).join('+');
      
      return !allowedInInputs.some(combo => eventCombo.includes(combo));
    }
    
    // Ignore shortcuts when contentEditable is active
    if (target.contentEditable === 'true') {
      return true;
    }
    
    return false;
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (shouldIgnoreEvent(event)) {
      return;
    }

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) continue;
      
      const combos = parseKeyCombo(shortcut.keys);
      const matches = combos.some(combo => matchesKeyCombo(event, combo));
      
      if (matches) {
        if (shortcut.preventDefault) {
          event.preventDefault();
        }
        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }
        
        try {
          shortcut.handler();
        } catch (error) {
          console.error('Error executing keyboard shortcut:', error);
          toast.error('Failed to execute shortcut');
        }
        
        break;
      }
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Add skip link for accessibility
  useEffect(() => {
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content';
    skipLink.className = 'skip-link';
    skipLink.setAttribute('tabindex', '0');
    
    document.body.insertBefore(skipLink, document.body.firstChild);
    
    return () => {
      if (document.body.contains(skipLink)) {
        document.body.removeChild(skipLink);
      }
    };
  }, []);

  return {
    showCommandPalette,
    setShowCommandPalette,
    showHelp,
    setShowHelp,
    shortcuts: shortcuts.map(s => ({
      keys: s.keys,
      description: s.description
    }))
  };
}