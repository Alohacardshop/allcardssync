import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { useTemplateDefault } from '@/hooks/useTemplateDefault';

interface DefaultTemplateGuardProps {
  children: React.ReactNode;
  action?: string;
  showInline?: boolean;
}

export function DefaultTemplateGuard({ 
  children, 
  action = "print labels",
  showInline = false 
}: DefaultTemplateGuardProps) {
  const navigate = useNavigate();
  const template = useTemplateDefault();

  if (!template || !template.id) {
    const handleSetDefault = () => {
      if (showInline) {
        toast({
          title: "Template Required",
          description: `Please set a default template before you can ${action}.`,
          variant: "destructive",
        });
      }
      navigate('/barcode-printing');
    };

    if (showInline) {
      return (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>No default template set. Cannot {action}.</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleSetDefault}
                className="ml-4"
              >
                <Settings className="h-3 w-3 mr-1" />
                Set Template
              </Button>
            </AlertDescription>
          </Alert>
          <div className="opacity-50 pointer-events-none">
            {children}
          </div>
        </div>
      );
    }

    // Block action with toast
    const blockedChildren = React.Children.map(children, (child) => {
      if (React.isValidElement(child)) {
        return React.cloneElement(child, {
          onClick: (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            toast({
              title: "Template Required",
              description: `Please set a default template before you can ${action}.`,
              variant: "destructive",
              action: (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSetDefault}
                >
                  Set Template
                </Button>
              ),
            });
          },
          disabled: true
        });
      }
      return child;
    });

    return <div>{blockedChildren}</div>;
  }

  return <div>{children}</div>;
}