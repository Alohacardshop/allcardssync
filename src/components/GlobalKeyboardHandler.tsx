import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useToast } from '@/hooks/use-toast';

export function GlobalKeyboardHandler() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showHelp, setShowHelp] = useState(false);
  const navTimeoutRef = useRef<number | null>(null);
  const navListenerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).contentEditable === 'true'
      ) {
        // Auto-advance after barcode scan (when field value matches barcode pattern)
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          const value = event.target.value.trim();
          // Check if it looks like a barcode (numbers, maybe with dashes)
          if (/^[\d\-A-Z]{8,}$/.test(value)) {
            // Try to focus next input field
            const form = event.target.closest('form');
            if (form) {
              const inputs = Array.from(form.querySelectorAll('input, select, textarea')) as HTMLElement[];
              const currentIndex = inputs.indexOf(event.target);
              const nextInput = inputs[currentIndex + 1];
              if (nextInput && 'focus' in nextInput) {
                (nextInput as HTMLInputElement).focus();
              }
            }
          }
        }
        return;
      }

      // Global shortcuts
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 's':
            event.preventDefault();
            // Trigger save on current form
            const form = document.querySelector('form');
            if (form) {
              const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement;
              if (submitButton && !submitButton.disabled) {
                submitButton.click();
                toast({ title: "Form saved", description: "Current form has been saved" });
              }
            }
            break;

          case 'p':
            event.preventDefault();
            // Open print dialog
            navigate('/barcode-printing');
            toast({ title: "Print dialog opened", description: "Navigated to barcode printing" });
            break;

          case '/':
            event.preventDefault();
            setShowHelp(true);
            break;

          case 'k':
            event.preventDefault();
            // Quick search - focus search input if it exists
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
              searchInput.select();
            } else {
              toast({ title: "Quick search", description: "No search field found on this page" });
            }
            break;
        }
      } else {
        // Single key shortcuts
        switch (event.key) {
          case 'Escape':
            // Close any open dialog
            const closeButtons = document.querySelectorAll('[role="dialog"] button[aria-label*="close" i], [role="dialog"] button[data-dismiss="dialog"]');
            if (closeButtons.length > 0) {
              (closeButtons[0] as HTMLButtonElement).click();
            }
            // Close help if open
            if (showHelp) {
              setShowHelp(false);
            }
            break;

          case '?':
            if (!event.shiftKey) return;
            event.preventDefault();
            setShowHelp(true);
            break;
        }
      }

      // Navigation shortcuts (G + key)
      if (event.key === 'g' || event.key === 'G') {
        // Clean up any existing listener/timeout
        if (navListenerRef.current) {
          document.removeEventListener('keydown', navListenerRef.current);
          navListenerRef.current = null;
        }
        if (navTimeoutRef.current) {
          clearTimeout(navTimeoutRef.current);
          navTimeoutRef.current = null;
        }

        // Set a flag to listen for the next key
        const handleNavKey = (navEvent: KeyboardEvent) => {
          switch (navEvent.key.toLowerCase()) {
            case 'h':
              navigate('/');
              toast({ title: "Navigation", description: "Navigated to Dashboard" });
              break;
            case 'i':
              navigate('/inventory');
              toast({ title: "Navigation", description: "Navigated to Inventory" });
              break;
            case 'b':
              navigate('/batches');
              toast({ title: "Navigation", description: "Navigated to Batches" });
              break;
            case 'l':
              navigate('/barcode-printing');
              toast({ title: "Navigation", description: "Navigated to Barcode Printing" });
              break;
          }
          // Clean up after navigation key pressed
          document.removeEventListener('keydown', handleNavKey);
          navListenerRef.current = null;
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
        };

        navListenerRef.current = handleNavKey;
        document.addEventListener('keydown', handleNavKey);

        // Listen for next key for 2 seconds
        navTimeoutRef.current = window.setTimeout(() => {
          if (navListenerRef.current) {
            document.removeEventListener('keydown', navListenerRef.current);
            navListenerRef.current = null;
          }
          navTimeoutRef.current = null;
        }, 2000);
      }
    };

    // Tab navigation enhancement
    const handleTabNavigation = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        // Ensure proper tab order through form fields
        const focusableElements = document.querySelectorAll(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        // Add visual indication for keyboard users
        const currentElement = document.activeElement;
        if (currentElement && focusableElements.length > 0) {
          currentElement.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            currentElement.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', handleTabNavigation);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keydown', handleTabNavigation);
      // Clean up navigation timeout and listener on unmount
      if (navTimeoutRef.current) {
        clearTimeout(navTimeoutRef.current);
      }
      if (navListenerRef.current) {
        document.removeEventListener('keydown', navListenerRef.current);
      }
    };
  }, [navigate, toast, showHelp]);

  return (
    <>
      <KeyboardShortcutsHelp open={showHelp} onOpenChange={setShowHelp} />
      
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-primary-foreground px-4 py-2 rounded-md z-50"
      >
        Skip to main content
      </a>
    </>
  );
}
