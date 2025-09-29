interface RefreshPolicyOptions {
  now: number;
  lastFetchedAt?: number;
  pausedByActivity: boolean;
  pageType: 'dashboard' | 'admin' | 'inventory';
  isVisible: boolean;
  networkOnline: boolean;
  staleTime?: number;
  hasFiltersChanged?: boolean;
  hasStoreChanged?: boolean;
  userIsIdle?: boolean;
}

interface RefreshDecision {
  shouldRefetch: boolean;
  reason?: string;
  nextCheckAt?: number;
}

const PAGE_STALE_TIMES = {
  inventory: 30_000,    // 30 seconds - frequently changing data
  dashboard: 60_000,    // 1 minute - metrics can be slightly stale
  admin: 300_000,       // 5 minutes - admin data changes less frequently
} as const;

export function shouldRefetch(options: RefreshPolicyOptions): RefreshDecision {
  const {
    now,
    lastFetchedAt,
    pausedByActivity,
    pageType,
    isVisible,
    networkOnline,
    staleTime,
    hasFiltersChanged = false,
    hasStoreChanged = false,
    userIsIdle = false
  } = options;

  // Never refresh if offline
  if (!networkOnline) {
    return {
      shouldRefetch: false,
      reason: 'offline',
      nextCheckAt: now + 10000 // Check again in 10s
    };
  }

  // Never refresh if page is not visible
  if (!isVisible) {
    return {
      shouldRefetch: false,
      reason: 'hidden',
      nextCheckAt: now + 5000 // Check again in 5s
    };
  }

  // Always refresh if filters or store context changed
  if (hasFiltersChanged || hasStoreChanged) {
    return {
      shouldRefetch: true,
      reason: hasFiltersChanged ? 'filters_changed' : 'store_changed'
    };
  }

  // Don't refresh if user is actively working (unless they're idle)
  if (pausedByActivity && !userIsIdle) {
    return {
      shouldRefetch: false,
      reason: 'user_active',
      nextCheckAt: now + 2000 // Check again soon
    };
  }

  // Check staleness
  const effectiveStaleTime = staleTime || PAGE_STALE_TIMES[pageType];
  const dataAge = lastFetchedAt ? now - lastFetchedAt : Infinity;
  
  if (dataAge > effectiveStaleTime) {
    return {
      shouldRefetch: true,
      reason: 'stale_data'
    };
  }

  // Data is fresh, check again when it becomes stale
  const nextStaleAt = lastFetchedAt ? lastFetchedAt + effectiveStaleTime : now;
  return {
    shouldRefetch: false,
    reason: 'fresh_data',
    nextCheckAt: nextStaleAt
  };
}

export function getNextRefreshTime(options: RefreshPolicyOptions): number | null {
  const decision = shouldRefetch(options);
  
  if (decision.shouldRefetch) {
    return options.now; // Refresh now
  }
  
  return decision.nextCheckAt || null;
}

// Utility to detect user inactivity
export class ActivityDetector {
  private lastActivity = Date.now();
  private listeners: (() => void)[] = [];
  private idleTimeout: NodeJS.Timeout | null = null;
  private readonly IDLE_THRESHOLD = 30000; // 30 seconds

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      this.notifyListeners();
      
      // Reset idle timer
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
      }
      this.idleTimeout = setTimeout(() => {
        this.notifyListeners(); // Notify when user becomes idle
      }, this.IDLE_THRESHOLD);
    };

    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true });
    });
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener());
  }

  public onActivityChange(callback: () => void) {
    this.listeners.push(callback);
    
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  public isUserIdle(): boolean {
    return Date.now() - this.lastActivity > this.IDLE_THRESHOLD;
  }

  public getLastActivity(): number {
    return this.lastActivity;
  }

  public destroy() {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
    }
    this.listeners = [];
  }
}

// Singleton activity detector
let activityDetector: ActivityDetector | null = null;

export function getActivityDetector(): ActivityDetector {
  if (!activityDetector) {
    activityDetector = new ActivityDetector();
  }
  return activityDetector;
}