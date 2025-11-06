import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        <h2 className="text-2xl font-bold mb-2">ALT Session Status</h2>
        <p className="text-muted-foreground">
          Monitor the status of the ALT Research scraping integration
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
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
        </div>
      </div>

      <div className="rounded-lg status-info p-4">
        <h4 className="font-semibold mb-2">✅ ScrapingBee Integration Active</h4>
        <p className="text-sm mb-3">
          Automated card lookups are enabled via ScrapingBee. The system will automatically fetch card details from ALT when you enter a certificate number.
        </p>
        <ul className="text-sm space-y-2">
          <li><strong>Current Setup:</strong> ScrapingBee API handles browser automation and HTML rendering</li>
          <li><strong>Features:</strong> Auto-detects grading service, extracts all card details, saves to database</li>
          <li><strong>Status:</strong> Ready to use - just enter certificate numbers in the "Lookup Cert" tab</li>
          <li><strong>Performance:</strong> Each lookup takes 5-10 seconds depending on ALT response time</li>
        </ul>
      </div>

      <div className="rounded-lg border p-4 bg-muted/50">
        <h4 className="font-semibold mb-2">Session Management</h4>
        <p className="text-sm text-muted-foreground">
          The session tracking above is for future automation features. Currently, ScrapingBee handles all authentication automatically with no manual session management required.
        </p>
      </div>
    </div>
  );
}
