import React, { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { useAuth } from "@/contexts/AuthContext";
import { Palmtree, Sparkles, Loader2 } from "lucide-react";

const ROLE_TIMEOUT_MS = 5000;
const AUTH_CHANGE_GUARD_MS = 4000;

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
  const { refetchRoles } = useAuth();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

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
    if (loading) return;
    clearGuardTimer();
    clearRoleTimer();
    cancelRoleCheckRef.current?.();

    setLoading(true);
    setRoleError(null);
    try {
      logger.info('Starting sign in process', { email });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      logger.info('Sign in successful', { email });
      toast.success("Signed in successfully!");

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
    if (currentAttemptId.current !== attemptId) return;

    setLoading(true);
    setRoleError(null);
    verificationInFlightRef.current = true;

    let canceled = false;
    cancelRoleCheckRef.current = () => { canceled = true; };

    try {
      logger.info('Preloading roles into cache', { userId });
      await refetchRoles();
      
      if (canceled || currentAttemptId.current !== attemptId) return;
      
      logger.info('Access granted, navigating to dashboard', { userId });
      navigate("/", { replace: true });
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[hsl(var(--ecosystem-hawaii)/0.1)] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[hsl(var(--ecosystem-vegas)/0.1)] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palmtree className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Aloha Inventory</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          {/* Welcome Text */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'signin' 
                ? 'Sign in to access your inventory dashboard' 
                : 'Get started with Aloha Inventory'}
            </p>
          </div>

          {/* Auth Card */}
          <Card className="shadow-lg border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">
                {mode === 'signin' ? 'Sign In' : 'Sign Up'}
              </CardTitle>
              <CardDescription>
                {mode === 'signin' 
                  ? 'Enter your credentials to continue' 
                  : 'Fill in your details to create an account'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="you@example.com"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    required 
                    className="h-11"
                  />
                </div>
                
                {roleError && (
                  <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {roleError}
                  </p>
                )}

                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-11 font-medium"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Please wait...
                    </>
                  ) : (
                    mode === 'signin' ? 'Sign In' : 'Create Account'
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-4 border-t">
                <Button 
                  type="button" 
                  variant="ghost" 
                  className="w-full text-muted-foreground"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                >
                  {mode === 'signin' 
                    ? "Don't have an account? Sign up" 
                    : 'Already have an account? Sign in'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Footer Notice */}
          <p className="text-xs text-center text-muted-foreground px-4">
            Access is restricted to authorized staff. After signup, an admin must grant the Staff role.
          </p>

          {/* Ecosystem Indicators */}
          <div className="flex items-center justify-center gap-4 pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--ecosystem-hawaii))]" />
              <span>Hawaii</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-3 h-3 rounded-full bg-[hsl(var(--ecosystem-vegas))]" />
              <span>Las Vegas</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
