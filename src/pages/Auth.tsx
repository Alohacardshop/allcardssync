import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { cleanupAuthState } from "@/lib/auth";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Auth page mount');
    setMounted(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Check role and route accordingly
        setTimeout(async () => {
          try {
            const uid = session.user.id;
            const staff = await supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any });
            const admin = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any });
            const ok = Boolean(staff.data) || Boolean(admin.data);
            if (ok) navigate("/", { replace: true });
            else {
              // Attempt to bootstrap admin role for initial setup
              try { await supabase.functions.invoke("bootstrap-admin"); } catch {}
              // Re-check roles after bootstrap attempt
              const staff2 = await supabase.rpc("has_role", { _user_id: uid, _role: "staff" as any });
              const admin2 = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any });
              const ok2 = Boolean(staff2.data) || Boolean(admin2.data);
              if (ok2) navigate("/", { replace: true });
              else setRoleError("Your account is signed in but not authorized. Ask an admin to grant Staff access.");
            }
          } catch (e) {
            console.error(e);
          }
        }, 0);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Will be handled by listener
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      cleanupAuthState();
      try { await supabase.auth.signOut({ scope: 'global' } as any); } catch {}
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      window.location.href = "/";
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

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
      console.error(err);
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
