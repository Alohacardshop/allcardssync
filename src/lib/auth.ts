export const cleanupAuthState = () => {
  try {
    // Remove standard Supabase auth tokens
    try { localStorage.removeItem('supabase.auth.token'); } catch {}
    // Remove all Supabase-related keys in localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        try { localStorage.removeItem(key); } catch {}
      }
    });
    // Remove any in sessionStorage
    Object.keys(sessionStorage || {}).forEach((key) => {
      if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
        try { sessionStorage.removeItem(key); } catch {}
      }
    });
  } catch {}
};
