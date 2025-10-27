import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";

const ROLE_TIMEOUT_MS = 5000; // Reduced from 8s to 5s
const AUTH_CHANGE_GUARD_MS = 4000; // Reduced from 6s to 4s

function useSEO(opts: { title: string; description?: string; canonical?: string }) {
  useEffect(() => {
    document.title = opts.title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", opts.description || "");
    else if (opts.description) {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = opts.description;
      document.head.appendChild(m);
    }
    const linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = opts.canonical || window.location.href;
    if (linkCanonical) linkCanonical.href = href;
    else {
      const l = document.createElement("link");
      l.rel = "canonical";
      l.href = href;
      document.head.appendChild(l);
    }
  }, [opts.title, opts.description, opts.canonical]);
}

export default function Auth() {
  useSEO({ title: "Sign In | Aloha", description: "Secure sign in for Aloha Inventory staff." });
  const navigate = useNavigate();

  // ✅ never start in loading
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Re-entrancy and cancellation
  const mountedRef = useRef(true);
  const subRef = useRef<ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"] | null>(null);
  const guardTimerRef = useRef<number | null>(null);
  const roleTimeoutRef = useRef<number | null>(null);
  const currentAttemptId = useRef<string | null>(null);
  const cancelRoleCheckRef = useRef<() => void>(() => {});
  const verificationInFlightRef = useRef(false);

  const clearGuardTimer = () => {
    if (guardTimerRef.current) {
      window.clearTimeout(guardTimerRef.current);
      guardTimerRef.current = null;
    }
  };
  const clearRoleTimer = () => {
    if (roleTimeoutRef.current) {
      window.clearTimeout(roleTimeoutRef.current);
      roleTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    logger.info('Auth page mounted');
    setMounted(true);

    // Single subscription, StrictMode-safe
    if (!subRef.current) {
      subRef.current = supabase.auth.onAuthStateChange(async (event, session) => {
        logger.info('Auth state change', { event, email: session?.user?.email });
        if (!mountedRef.current) return;
        if (event === "SIGNED_IN" && session?.user) {
          clearGuardTimer();
          const attempt = crypto.randomUUID();
          currentAttemptId.current = attempt;
          await verifyAccessThenNavigate(session.user.id, attempt);
        }
        if (event === "SIGNED_OUT") {
          clearGuardTimer();
          setLoading(false);
          setRoleError(null);
        }
      }).data.subscription;
    }

    // Check existing session but don't block UI
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          logger.info('Existing session found', { email: session.user.email });
          const attempt = crypto.randomUUID();
          currentAttemptId.current = attempt;
          await verifyAccessThenNavigate(session.user.id, attempt);
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    })();

    // Cleanup
    return () => {
      mountedRef.current = false;
      clearGuardTimer();
      clearRoleTimer();
      cancelRoleCheckRef.current?.();
      if (subRef.current) {
        subRef.current.unsubscribe();
        subRef.current = null;
      }
    };
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard double submit
    clearGuardTimer();
    clearRoleTimer();
    cancelRoleCheckRef.current?.(); // cancel any in-flight role checks

    setLoading(true);
    setRoleError(null);
    try {
      logger.info('Starting sign in process', { email });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      logger.info('Sign in successful', { email });
      toast.success("Signed in successfully!");

      // If auth event doesn't arrive, unlock UI
      guardTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current) return;
        setLoading(false);
        toast.error("Login is taking too long. Please try again.");
      }, AUTH_CHANGE_GUARD_MS);
    } catch (err: any) {
      logger.error('Sign in error', err, { email });
      setLoading(false);
      toast.error(err?.message || "Sign-in failed");
    }
  }

  async function verifyAccessThenNavigate(userId: string, attemptId: string) {
    // Ignore stale attempts
    if (currentAttemptId.current !== attemptId) return;

    setLoading(true);
    setRoleError(null);
    verificationInFlightRef.current = true;

    // Build a cancelable promise around the role RPC
    let canceled = false;
    cancelRoleCheckRef.current = () => { canceled = true; };

    const roleCheckPromise = (async () => {
      logger.info('Processing auth verification', { userId });
      const { data, error } = await supabase.rpc("verify_user_access", { _user_id: userId });
      if (error) throw error;
      return data as { access_granted?: boolean } | null;
    })();

    // Manual timeout (so we can clear it deterministically)
    const timeoutPromise = new Promise<never>((_, reject) => {
      roleTimeoutRef.current = window.setTimeout(() => {
        reject(new Error("Role check timeout"));
      }, ROLE_TIMEOUT_MS);
    });

    try {
      const result = await Promise.race([roleCheckPromise, timeoutPromise]);
      if (canceled || currentAttemptId.current !== attemptId) return; // new attempt started
      logger.info('Access verification result', { result, userId });
      const granted = !!(result && typeof result === "object" && "access_granted" in result && (result as any).access_granted);
      if (granted) {
        logger.info('Access granted, navigating to dashboard', { userId });
        navigate("/", { replace: true });
      } else {
        toast.warning("Signed in, but access not fully verified yet. Some features may be limited.");
        navigate("/", { replace: true });
      }
    } catch (err: any) {
      if (canceled || currentAttemptId.current !== attemptId) return;
      logger.error('Role check failed', err, { userId });
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        toast.success("Signed in successfully! Proceeding to dashboard...");
        navigate("/", { replace: true });
      } else {
        setRoleError("Failed to verify account permissions. Please try again.");
      }
    } finally {
      clearRoleTimer();
      verificationInFlightRef.current = false;
      if (mountedRef.current && currentAttemptId.current === attemptId) {
        setLoading(false);
      }
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      toast.success("Check your email to confirm your account");
    } catch (err: any) {
      logger.error('Sign up failed', err, { email });
      toast.error(err?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-8 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Aloha Inventory Login</h1>
          <Link to="/"><Button variant="secondary">Back</Button></Link>
        </div>
      </header>
      <main className="container mx-auto px-6 py-12 max-w-md">
        <Card className="shadow-aloha">
          <CardHeader>
            <CardTitle>{mode === 'signin' ? 'Sign In' : 'Create an account'}</CardTitle>
          </CardHeader>
          <CardContent>
            {mounted && (
              <p data-testid="auth-debug" className="text-xs text-muted-foreground mb-2">Auth mounted</p>
            )}
            <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {roleError && (
                <p className="text-sm text-muted-foreground">{roleError}</p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={loading}>{loading ? 'Please wait…' : (mode === 'signin' ? 'Sign In' : 'Sign Up')}</Button>
                <Button type="button" variant="outline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? 'Create account' : 'Have an account? Sign in'}
                </Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground mt-4">Access is restricted to authorized staff. After signup, an admin must grant the Staff role.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
