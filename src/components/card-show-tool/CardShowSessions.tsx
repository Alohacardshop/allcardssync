import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogIn, RefreshCw, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export function CardShowSessions() {
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

      <div className="rounded-lg border p-4 bg-muted/50">
        <h4 className="font-semibold mb-2">About ALT Sessions</h4>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>• Sessions use Playwright to automate browser login</li>
          <li>• Cookies are saved locally for future requests</li>
          <li>• If CAPTCHA or MFA is required, manual intervention is needed</li>
          <li>• Sessions expire periodically and need to be refreshed</li>
        </ul>
      </div>
    </div>
  );
}
