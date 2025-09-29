import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';

export type LoadingPhase = 'auth' | 'store' | 'data' | 'ui';
export type LoadingSeverity = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'degraded';

export interface LoadingSnapshot {
  dominantPhase: LoadingPhase | null;
  phases: Record<LoadingPhase, LoadingSeverity>;
  message?: string;
  progress?: number; // 0..1 for long operations
  nextRefreshAt?: number | null;
  pausedByActivity?: boolean;
  a11yAnnouncement?: string | null;
}

export interface UseLoadingStateManagerOptions {
  pageType?: 'dashboard' | 'admin' | 'inventory';
  initial?: Partial<LoadingSnapshot>;
}

const PHASE_PRIORITY: LoadingPhase[] = ['auth', 'store', 'data', 'ui'];
const ACTIVITY_PAUSE_DURATION = 5000; // 5 seconds

function getDominantPhase(phases: Record<LoadingPhase, LoadingSeverity>): LoadingPhase | null {
  for (const phase of PHASE_PRIORITY) {
    if (phases[phase] === 'loading' || phases[phase] === 'error') {
      return phase;
    }
  }
  return null;
}

export function useLoadingStateManager(opts: UseLoadingStateManagerOptions = {}) {
  const { pageType = 'inventory', initial = {} } = opts;
  
  const [phases, setPhases] = useState<Record<LoadingPhase, LoadingSeverity>>({
    auth: 'idle',
    store: 'idle',
    data: 'idle',
    ui: 'idle',
    ...initial.phases,
  });
  
  const [message, setMessage] = useState<string | undefined>(initial.message);
  const [progress, setProgress] = useState<number | undefined>(initial.progress);
  const [nextRefreshAt, setNextRefreshAt] = useState<number | null>(initial.nextRefreshAt || null);
  const [pausedByActivity, setPausedByActivity] = useState(false);
  const [a11yAnnouncement, setA11yAnnouncement] = useState<string | null>(initial.a11yAnnouncement || null);
  
  const lastActivityRef = useRef<number>(Date.now());
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyFormRef = useRef(false);

  // Activity detection
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setPausedByActivity(true);
    
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
    
    activityTimeoutRef.current = setTimeout(() => {
      setPausedByActivity(false);
    }, ACTIVITY_PAUSE_DURATION);
  }, []);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // When returning to visible, schedule immediate refresh if we have stale data
      setNextRefreshAt(Date.now());
    }
  }, []);

  const handleOnline = useCallback(() => {
    if (navigator.onLine) {
      setNextRefreshAt(Date.now());
    }
  }, []);

  useEffect(() => {
    // Set up activity listeners
    const events = ['keydown', 'pointerdown', 'input', 'change'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });
    
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    // Check for dirty forms
    const formElements = document.querySelectorAll('form input, form textarea, form select');
    const handleFormChange = () => {
      isDirtyFormRef.current = true;
      handleActivity();
    };
    
    formElements.forEach(el => {
      el.addEventListener('input', handleFormChange);
      el.addEventListener('change', handleFormChange);
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      
      formElements.forEach(el => {
        el.removeEventListener('input', handleFormChange);
        el.removeEventListener('change', handleFormChange);
      });
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
    };
  }, [handleActivity, handleVisibilityChange, handleOnline]);

  const setPhase = useCallback((phase: LoadingPhase, severity: LoadingSeverity, extras?: { message?: string; progress?: number; a11yAnnouncement?: string }) => {
    setPhases(prev => ({ ...prev, [phase]: severity }));
    
    if (extras?.message !== undefined) {
      setMessage(extras.message);
    }
    if (extras?.progress !== undefined) {
      setProgress(extras.progress);
    }
    if (extras?.a11yAnnouncement !== undefined) {
      setA11yAnnouncement(extras.a11yAnnouncement);
    }
  }, []);

  const pauseAutoRefresh = useCallback(() => {
    setPausedByActivity(true);
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
  }, []);

  const resumeAutoRefresh = useCallback(() => {
    setPausedByActivity(false);
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
  }, []);

  const snapshot: LoadingSnapshot = {
    dominantPhase: getDominantPhase(phases),
    phases,
    message,
    progress,
    nextRefreshAt,
    pausedByActivity: pausedByActivity || isDirtyFormRef.current,
    a11yAnnouncement,
  };

  return {
    snapshot,
    setPhase,
    setMessage,
    setProgress,
    setNextRefreshAt,
    setA11yAnnouncement,
    pauseAutoRefresh,
    resumeAutoRefresh,
  };
}

// Context for app-wide access
const LoadingContext = createContext<ReturnType<typeof useLoadingStateManager> | null>(null);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const manager = useLoadingStateManager();
  return (
    <LoadingContext.Provider value={manager}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoadingContext = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoadingContext must be used within LoadingProvider');
  }
  return context;
};