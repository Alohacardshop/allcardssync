import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LogIn, RefreshCw, PlayCircle, ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function CardShowSessions() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);

  const { data: session, isLoading, refetch } = useQuery({
    queryKey: ["scrape-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scrape_sessions")
        .select("*")
        .eq("service", "ALT")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const { data: credentialsStatus } = useQuery({
    queryKey: ["alt-credentials-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("card-show-credentials/status");
      if (error) throw error;
      return data;
    },
  });

  const saveCredentialsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("card-show-credentials", {
        body: { email, password },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Credentials saved successfully");
      queryClient.invalidateQueries({ queryKey: ["alt-credentials-status"] });
      setEmail("");
      setPassword("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to save credentials");
    },
  });

  const clearCredentialsMutation = useMutation({
    mutationFn: async () => {
      // Call DELETE endpoint directly with fetch
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/card-show-credentials`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear credentials');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast.success("Credentials cleared");
      queryClient.invalidateQueries({ queryKey: ["alt-credentials-status"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to clear credentials");
    },
  });

  const testCredentialsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("card-show-credentials/test");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Connection test successful");
    },
    onError: (error: any) => {
      toast.error(error.message || "Connection test failed");
    },
  });

  const handleLogin = async () => {
    toast.info("ALT login not yet implemented - Playwright integration coming soon!");
    // TODO: Call edge function to initiate Playwright login
  };

  const handleContinue = async () => {
    toast.info("Session continuation not yet implemented");
    // TODO: Update session status to 'ready'
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "ready":
        return <Badge variant="default">Ready</Badge>;
      case "needs-human":
        return <Badge variant="secondary">Needs Human</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Not Initialized</Badge>;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading session status...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">ALT Session Management</h2>
        <p className="text-muted-foreground">
          Manage authentication session for scraping ALT Research pages
        </p>
      </div>

      {/* ALT Credentials Section */}
      <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <div className="rounded-lg border p-4">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">ALT Credentials</h3>
                {credentialsStatus?.configured && (
                  <Badge variant="default">✓ Configured</Badge>
                )}
                {!credentialsStatus?.configured && (
                  <Badge variant="destructive">⚠ Not Configured</Badge>
                )}
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${credentialsOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 space-y-4">
            {credentialsStatus?.configured && (
              <div className="bg-muted p-3 rounded text-sm">
                <p className="font-semibold mb-1">Current Email:</p>
                <p>{credentialsStatus.email_masked}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="alt-email">ALT Email</Label>
                <Input
                  id="alt-email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="alt-password">ALT Password</Label>
                <div className="relative">
                  <Input
                    id="alt-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => saveCredentialsMutation.mutate()}
                disabled={!email || !password || saveCredentialsMutation.isPending}
              >
                {saveCredentialsMutation.isPending ? "Saving..." : "Save Credentials"}
              </Button>
              {credentialsStatus?.configured && (
                <Button
                  onClick={() => clearCredentialsMutation.mutate()}
                  disabled={clearCredentialsMutation.isPending}
                  variant="destructive"
                >
                  {clearCredentialsMutation.isPending ? "Clearing..." : "Clear Credentials"}
                </Button>
              )}
            </div>
            
            {credentialsStatus?.configured && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded text-sm">
                <p className="text-blue-900 dark:text-blue-100">
                  ✓ Credentials are stored securely. To enable automated scraping, you need to set up an external scraping service (see documentation for options).
                </p>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <div className="rounded-lg border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">ALT Session</h3>
            <p className="text-sm text-muted-foreground">app.alt.xyz</p>
          </div>
          {getStatusBadge(session?.status || null)}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Last Login:</span>
            <p className="font-medium">
              {session?.last_login_at
                ? new Date(session.last_login_at).toLocaleString()
                : "Never"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Last Cookie Refresh:</span>
            <p className="font-medium">
              {session?.last_cookie_refresh_at
                ? new Date(session.last_cookie_refresh_at).toLocaleString()
                : "Never"}
            </p>
          </div>
        </div>

        {session?.message && (
          <div className="bg-muted p-3 rounded text-sm">
            <p className="font-semibold mb-1">Message:</p>
            <p>{session.message}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleLogin}>
            <LogIn className="h-4 w-4 mr-2" />
            Login to ALT
          </Button>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
          {session?.status === "needs-human" && (
            <Button onClick={handleContinue} variant="secondary">
              <PlayCircle className="h-4 w-4 mr-2" />
              Continue (After Manual Login)
            </Button>
          )}
        </div>

        {session?.status === "needs-human" && (
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4 rounded">
            <p className="text-sm text-amber-900 dark:text-amber-100">
              <strong>Action Required:</strong> A browser window has opened for manual login. 
              Please complete the login process (including any CAPTCHA or MFA), then click the 
              "Continue" button above once you're logged in.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950">
        <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-100">⚠️ Automated Scraping Not Yet Available</h4>
        <p className="text-sm text-amber-900 dark:text-amber-100 mb-3">
          Browser automation (Playwright) cannot run in Supabase Edge Functions. To enable automated card lookups, choose one of these options:
        </p>
        <ul className="text-sm space-y-2 text-amber-900 dark:text-amber-100">
          <li><strong>Option 1 (Recommended):</strong> Use an external scraping API service like ScrapingBee or Bright Data</li>
          <li><strong>Option 2:</strong> Deploy your own Playwright server (Railway, Render, Fly.io) and connect it to this system</li>
          <li><strong>Option 3:</strong> Use manual card entry as a fallback (no automation required)</li>
        </ul>
        <p className="text-sm text-amber-900 dark:text-amber-100 mt-3">
          See the documentation for detailed setup instructions for each option.
        </p>
      </div>
    </div>
  );
}
