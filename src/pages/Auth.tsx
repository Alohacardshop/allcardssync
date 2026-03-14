import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Palmtree, Loader2, ArrowLeft } from "lucide-react";

const ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": "Incorrect email or password. Try again or use Forgot Password below.",
  "Email not confirmed": "Your account hasn't been activated yet. Contact your admin.",
  "User not found": "No account found with that email. Contact your admin.",
  "Too many requests": "Too many attempts. Please wait a moment and try again.",
};

function friendlyError(msg: string): string {
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.includes(key)) return friendly;
  }
  return "Something went wrong. Try again or contact your admin.";
}

export default function Auth() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [resetSent, setResetSent] = useState(false);

  // If already logged in, redirect to dashboard (AuthGuard handles role check)
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in!");
      // AuthContext will update `user`, triggering the redirect above
    } catch (err: any) {
      setError(friendlyError(err?.message || ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      setError(friendlyError(err?.message || ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Decorative Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-[hsl(var(--ecosystem-hawaii)/0.1)] rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[hsl(var(--ecosystem-vegas)/0.1)] rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Palmtree className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Aloha Inventory</span>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Reset Password"}
            </h1>
            <p className="text-muted-foreground">
              {mode === "signin"
                ? "Sign in to access your inventory dashboard"
                : "Enter your email to receive a reset link"}
            </p>
          </div>

          <Card className="shadow-lg border-border/50 bg-card/80 backdrop-blur-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl">
                {mode === "signin" ? "Sign In" : "Forgot Password"}
              </CardTitle>
              <CardDescription>
                {mode === "signin"
                  ? "Enter your credentials to continue"
                  : "We'll send a password reset link to your email"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode === "forgot" && resetSent ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground bg-muted px-3 py-3 rounded-md">
                    If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly. Check your inbox and spam folder.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => { setMode("signin"); setResetSent(false); setError(null); }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={mode === "signin" ? handleSignIn : handleForgotPassword} className="space-y-4">
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

                  {mode === "signin" && (
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
                  )}

                  {error && (
                    <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                      {error}
                    </p>
                  )}

                  <Button type="submit" disabled={loading} className="w-full h-11 font-medium">
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Please wait...</>
                    ) : mode === "signin" ? (
                      "Sign In"
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>

                  {mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(null); }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Forgot password?
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setMode("signin"); setError(null); }}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to Sign In
                    </button>
                  )}
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground px-4">
            Access is restricted to authorized staff. Contact an admin to get an account.
          </p>

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
