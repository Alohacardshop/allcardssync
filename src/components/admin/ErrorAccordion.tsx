import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ErrorItem {
  id: string;
  message: string;
  level: string;
  created_at: string;
  metadata?: {
    stack?: string;
    details?: string;
    [key: string]: any;
  };
}

interface ErrorAccordionProps {
  errors: ErrorItem[];
  onRetry?: (errorId: string) => void;
}

export function ErrorAccordion({ errors, onRetry }: ErrorAccordionProps) {
  const [openStates, setOpenStates] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const toggleError = (id: string) => {
    setOpenStates(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Error details copied successfully"
    });
  };

  // Group similar errors
  const groupedErrors = errors.reduce((acc, error) => {
    const key = error.message.substring(0, 50);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(error);
    return acc;
  }, {} as Record<string, ErrorItem[]>);

  if (errors.length === 0) {
    return null;
  }

  return (
    <Card className="border-2 border-destructive/20 bg-destructive/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="w-5 h-5" />
          Recent Errors ({errors.length})
        </div>

        <div className="space-y-2">
          {Object.entries(groupedErrors).map(([key, groupErrors]) => {
            const firstError = groupErrors[0];
            const isOpen = openStates[firstError.id];
            const hasMultiple = groupErrors.length > 1;

            return (
              <Collapsible 
                key={firstError.id}
                open={isOpen}
                onOpenChange={() => toggleError(firstError.id)}
              >
                <Card className={cn(
                  "border transition-all",
                  isOpen ? "border-destructive" : "border-destructive/20"
                )}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-start justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-destructive line-clamp-2">
                            {firstError.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(firstError.created_at), { addSuffix: true })}
                            </p>
                            {hasMultiple && (
                              <Badge variant="outline" className="text-xs">
                                {groupErrors.length}x
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-3 pb-3 pt-0 space-y-3 border-t border-destructive/10 mt-2">
                      {/* Error Details */}
                      {firstError.metadata?.details && (
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="text-xs text-muted-foreground font-mono">
                            {firstError.metadata.details}
                          </p>
                        </div>
                      )}

                      {/* Stack Trace */}
                      {firstError.metadata?.stack && (
                        <div className="bg-muted/50 rounded-md p-3 max-h-40 overflow-y-auto">
                          <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap">
                            {firstError.metadata.stack}
                          </pre>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(
                            JSON.stringify({ 
                              message: firstError.message,
                              ...firstError.metadata 
                            }, null, 2)
                          )}
                          className="flex items-center gap-2"
                        >
                          <Copy className="w-3 h-3" />
                          Copy Details
                        </Button>
                        {onRetry && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onRetry(firstError.id)}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Retry
                          </Button>
                        )}
                      </div>

                      {/* Show all occurrences if multiple */}
                      {hasMultiple && (
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium mb-2">All occurrences:</p>
                          <div className="space-y-1">
                            {groupErrors.map((err, idx) => (
                              <div key={err.id} className="flex items-center justify-between">
                                <span>#{idx + 1}</span>
                                <span>{formatDistanceToNow(new Date(err.created_at), { addSuffix: true })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}