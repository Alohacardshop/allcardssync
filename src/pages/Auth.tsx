import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { cleanupAuthState } from "@/lib/authUtils";

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
    
    // Check for existing session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        console.log('Existing session found for:', session.user.email);
        await handleUserAuthentication(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.user) {
        await handleUserAuthentication(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setLoading(false);
        setRoleError(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleUserAuthentication = async (userId: string) => {
    setLoading(true);
    setRoleError(null);
    
    try {
      console.log('Processing auth for user:', userId);
      
      // Try bootstrap first for initial admin setup
      try {
        console.log('Attempting bootstrap...');
        await supabase.functions.invoke("bootstrap-admin");
        console.log('Bootstrap completed');
      } catch (bootstrapError) {
        console.log('Bootstrap attempt failed (expected for non-admins):', bootstrapError);
      }
      
      // Check roles with timeout
      console.log('Checking user roles...');
      const roleCheckPromise = Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "staff" as any }),
        supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any })
      ]);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Role check timeout")), 5000)
      );
      
      const [staff, admin] = await Promise.race([roleCheckPromise, timeoutPromise]) as any;
      console.log('Role check results:', { staff: staff?.data, admin: admin?.data });
      
      const hasValidRole = Boolean(staff?.data) || Boolean(admin?.data);
      
      if (hasValidRole) {
        console.log('Valid role found, navigating to dashboard');
        navigate("/", { replace: true });
      } else {
        console.log('No valid role found');
        setRoleError("Your account is signed in but not authorized. Ask an admin to grant Staff access.");
      }
    } catch (error) {
      console.error('Role check failed:', error);
      if (error?.message === "Role check timeout") {
        setRoleError("Authentication is taking too long. Please try refreshing the page.");
      } else {
        setRoleError("Failed to verify account permissions. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRoleError(null);
    
    try {
      console.log('Starting sign in process');
      cleanupAuthState();
      
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) throw error;
      
      console.log('Sign in successful, data:', data);
      toast.success("Signed in successfully!");
      
      // Don't set loading to false here - let the auth state change handle it
    } catch (err: any) {
      console.error('Sign in error:', err);
      toast.error(err?.message || "Sign in failed");
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
