import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';
import { LAYOUT } from '@/lib/design-tokens';

interface AppShellProps {
  children: ReactNode;
  className?: string;
  /** Hide navigation (useful for auth pages) */
  hideNav?: boolean;
}

/**
 * Main application shell that provides consistent layout structure
 * - Header with ecosystem branding
 * - Sidebar navigation (desktop)
 * - Bottom navigation (mobile)
 * - Proper content padding and scroll handling
 */
export function AppShell({ children, className, hideNav = false }: AppShellProps) {
  const isMobile = useIsMobile();

  if (hideNav) {
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header />
      
      {/* Main layout container */}
      <div className="flex">
        {/* Sidebar - hidden on mobile */}
        {!isMobile && <Sidebar />}
        
        {/* Main content area */}
        <main
          className={cn(
            'flex-1 min-h-[calc(100vh-var(--header-height))]',
            // Padding for header
            'pt-14 md:pt-16',
            // Padding for sidebar on desktop
            'md:pl-16 lg:pl-60',
            // Padding for bottom nav on mobile
            'pb-20 md:pb-0',
            // Content padding
            'px-4 md:px-6',
            className
          )}
          style={{
            '--header-height': isMobile ? `${LAYOUT.headerHeight}px` : `${LAYOUT.headerHeightDesktop}px`,
          } as React.CSSProperties}
        >
          <div className="py-4 md:py-6 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom nav - mobile only */}
      {isMobile && <BottomNav />}
    </div>
  );
}
