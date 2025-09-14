import React, { createContext, useContext, useState, useEffect } from 'react';

interface AccessibilitySettings {
  reduceMotion: boolean;
  highContrast: boolean;
  largeText: boolean;
  screenReaderMode: boolean;
  keyboardNavigation: boolean;
}

interface AccessibilityContextType {
  settings: AccessibilitySettings;
  updateSetting: (key: keyof AccessibilitySettings, value: boolean) => void;
  announceToScreenReader: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | null>(null);

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export function AccessibilityProvider({ children }: AccessibilityProviderProps) {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    reduceMotion: false,
    highContrast: false,
    largeText: false,
    screenReaderMode: false,
    keyboardNavigation: true,
  });

  // Detect user preferences
  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setSettings(prev => ({ ...prev, reduceMotion: true }));
    }

    // Check for high contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    if (prefersHighContrast) {
      setSettings(prev => ({ ...prev, highContrast: true }));
    }

    // Detect screen reader usage
    const hasScreenReader = 'speechSynthesis' in window || 
                            navigator.userAgent.includes('NVDA') ||
                            navigator.userAgent.includes('JAWS') ||
                            navigator.userAgent.includes('VoiceOver');
    
    if (hasScreenReader) {
      setSettings(prev => ({ ...prev, screenReaderMode: true }));
    }

    // Load saved preferences
    const savedSettings = localStorage.getItem('accessibility-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse accessibility settings:', error);
      }
    }
  }, []);

  // Apply settings to document
  useEffect(() => {
    const root = document.documentElement;
    
    // Apply CSS classes based on settings
    root.classList.toggle('reduce-motion', settings.reduceMotion);
    root.classList.toggle('high-contrast', settings.highContrast);
    root.classList.toggle('large-text', settings.largeText);
    root.classList.toggle('screen-reader-mode', settings.screenReaderMode);
    root.classList.toggle('keyboard-navigation-enabled', settings.keyboardNavigation);

    // Save settings to localStorage
    localStorage.setItem('accessibility-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = (key: keyof AccessibilitySettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const announceToScreenReader = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    // Create a live region for screen reader announcements
    let liveRegion = document.getElementById('accessibility-live-region');
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'accessibility-live-region';
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.position = 'absolute';
      liveRegion.style.left = '-10000px';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.overflow = 'hidden';
      document.body.appendChild(liveRegion);
    }

    // Update the live region with the message
    liveRegion.setAttribute('aria-live', priority);
    liveRegion.textContent = message;

    // Clear the message after a delay to avoid repeated announcements
    setTimeout(() => {
      if (liveRegion) {
        liveRegion.textContent = '';
      }
    }, 1000);
  };

  const value: AccessibilityContextType = {
    settings,
    updateSetting,
    announceToScreenReader,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      
      {/* Add global accessibility styles */}
      <style>{`
        /* Reduced motion preferences */
        .reduce-motion *,
        .reduce-motion *::before,
        .reduce-motion *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }

        /* High contrast mode */
        .high-contrast {
          filter: contrast(150%);
        }

        /* Large text mode */
        .large-text {
          font-size: 120% !important;
        }
        
        .large-text * {
          font-size: inherit !important;
        }

        /* Screen reader optimizations */
        .screen-reader-mode .sr-only {
          position: static !important;
          width: auto !important;
          height: auto !important;
          padding: 0 !important;
          margin: 0 !important;
          overflow: visible !important;
          clip: auto !important;
          white-space: normal !important;
        }

        /* Keyboard navigation enhancements */
        .keyboard-navigation-enabled *:focus {
          outline: 2px solid hsl(var(--primary)) !important;
          outline-offset: 2px !important;
          border-radius: 4px !important;
        }

        /* Skip links */
        .skip-link {
          position: absolute;
          top: -40px;
          left: 6px;
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          padding: 8px;
          z-index: 9999;
          text-decoration: none;
          border-radius: 4px;
        }

        .skip-link:focus {
          top: 6px;
        }

        /* Focus indicators for interactive elements */
        .keyboard-navigation-enabled button:focus,
        .keyboard-navigation-enabled a:focus,
        .keyboard-navigation-enabled input:focus,
        .keyboard-navigation-enabled select:focus,
        .keyboard-navigation-enabled textarea:focus,
        .keyboard-navigation-enabled [tabindex]:focus {
          outline: 2px solid hsl(var(--primary)) !important;
          outline-offset: 2px !important;
        }

        /* Ensure sufficient color contrast */
        @media (prefers-contrast: high) {
          :root {
            --background: 0 0% 100% !important;
            --foreground: 0 0% 0% !important;
            --muted: 0 0% 90% !important;
            --muted-foreground: 0 0% 10% !important;
            --border: 0 0% 80% !important;
          }
          
          [data-theme="dark"] {
            --background: 0 0% 0% !important;
            --foreground: 0 0% 100% !important;
            --muted: 0 0% 10% !important;
            --muted-foreground: 0 0% 90% !important;
            --border: 0 0% 20% !important;
          }
        }
      `}</style>
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}