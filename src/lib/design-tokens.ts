/**
 * Design System Tokens
 * Centralized design constants for the application
 */

// Spacing scale (in pixels, use with Tailwind spacing utilities)
export const SPACING = {
  xs: 4,    // space-1
  sm: 8,    // space-2
  md: 12,   // space-3
  lg: 16,   // space-4
  xl: 24,   // space-6
  '2xl': 32, // space-8
  '3xl': 48, // space-12
  '4xl': 64, // space-16
} as const;

// Border radius values
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Animation durations (in ms)
export const ANIMATION = {
  fast: 150,
  normal: 200,
  slow: 300,
  slower: 500,
} as const;

// Z-index layers
export const Z_INDEX = {
  dropdown: 50,
  sticky: 100,
  fixed: 200,
  overlay: 300,
  modal: 400,
  popover: 500,
  toast: 600,
  tooltip: 700,
} as const;

// Breakpoints (matching Tailwind defaults)
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1400,
} as const;

// Layout constants
export const LAYOUT = {
  headerHeight: 56,
  headerHeightDesktop: 64,
  sidebarWidth: 240,
  sidebarCollapsedWidth: 64,
  bottomNavHeight: 64,
  maxContentWidth: 1400,
  contentPadding: 16,
  contentPaddingDesktop: 24,
} as const;

// Ecosystem-specific theming
export const ECOSYSTEM_THEMES = {
  hawaii: {
    name: 'Hawaii',
    shortName: 'HI',
    icon: '🌺', // Palm tree emoji as fallback
    accentHue: 174, // Teal
    accentSaturation: 72,
    accentLightness: 40,
    gradientFrom: '174 72% 40%', // Teal
    gradientTo: '174 72% 30%',
    badgeClass: 'bg-teal-500/10 text-teal-600 border-teal-500/20 dark:bg-teal-500/20 dark:text-teal-400',
    accentClass: 'text-teal-600 dark:text-teal-400',
    bgClass: 'bg-teal-50 dark:bg-teal-950/50',
  },
  las_vegas: {
    name: 'Las Vegas',
    shortName: 'LV',
    icon: '🎰', // Slot machine emoji as fallback
    accentHue: 45, // Gold
    accentSaturation: 93,
    accentLightness: 47,
    gradientFrom: '45 93% 47%', // Gold
    gradientTo: '38 92% 42%',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400',
    accentClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
  },
} as const;

export type EcosystemKey = keyof typeof ECOSYSTEM_THEMES;

// Get ecosystem theme by key
export function getEcosystemTheme(ecosystem: string | null | undefined) {
  if (ecosystem === 'hawaii') return ECOSYSTEM_THEMES.hawaii;
  if (ecosystem === 'las_vegas') return ECOSYSTEM_THEMES.las_vegas;
  return ECOSYSTEM_THEMES.hawaii; // Default fallback
}

// Navigation items for the app
export const NAV_ITEMS = {
  main: [
    { key: 'home', label: 'Home', href: '/', icon: 'Home' },
    { key: 'intake', label: 'Intake', href: '/intake', icon: 'PackagePlus' },
    { key: 'inventory', label: 'Inventory', href: '/inventory', icon: 'Package' },
    { key: 'barcode', label: 'Print', href: '/barcode-printing', icon: 'Printer' },
  ],
  secondary: [
    { key: 'docs', label: 'Documents', href: '/docs', icon: 'FileText' },
    { key: 'ebay', label: 'eBay', href: '/ebay', icon: 'ShoppingBag', adminOnly: true },
    { key: 'admin', label: 'Admin', href: '/admin', icon: 'Settings', adminOnly: true },
  ],
} as const;

// Mobile bottom nav items (subset of main items)
export const BOTTOM_NAV_ITEMS = [
  { key: 'home', label: 'Home', href: '/', icon: 'Home' },
  { key: 'intake', label: 'Intake', href: '/intake', icon: 'PackagePlus' },
  { key: 'inventory', label: 'Inventory', href: '/inventory', icon: 'Package' },
  { key: 'barcode', label: 'Print', href: '/barcode-printing', icon: 'Printer' },
  { key: 'more', label: 'More', href: '#', icon: 'Menu' },
] as const;
