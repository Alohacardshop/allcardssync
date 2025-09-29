import { useEffect } from 'react';

/**
 * Component to preload fonts used in the application
 * Helps prevent layout shifts during font loading
 */
export function FontPreloader() {
  useEffect(() => {
    // Preload critical font weights that are actually used in tailwind.config.ts
    const fontsToPreload = [
      // Inter font weights used in the app
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    ];

    fontsToPreload.forEach(fontUrl => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.href = fontUrl;
      (link as any).onload = function(this: HTMLLinkElement) {
        // Convert preload to stylesheet after loading
        this.onload = null;
        this.rel = 'stylesheet';
      };
      document.head.appendChild(link);
    });

    // Preload specific font files for critical text
    const criticalFonts = [
      {
        family: 'Inter',
        weight: '400',
        style: 'normal',
        format: 'woff2'
      },
      {
        family: 'Inter', 
        weight: '500',
        style: 'normal',
        format: 'woff2'
      },
      {
        family: 'Inter',
        weight: '600', 
        style: 'normal',
        format: 'woff2'
      }
    ];

    criticalFonts.forEach(font => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'font';
      link.type = `font/${font.format}`;
      link.crossOrigin = 'anonymous';
      // Note: Actual font URLs would need to be determined from Google Fonts
      // This is a placeholder for the concept
      document.head.appendChild(link);
    });

  }, []);

  return null; // This component doesn't render anything
}