import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Webhook, Package, Upload } from 'lucide-react';

interface QuickActionsProps {
  onNavigate: (section: string) => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions = [
    {
      label: 'Configure Discord',
      icon: MessageSquare,
      description: 'Set up webhooks for notifications',
      onClick: () => onNavigate('regions'),
    },
    {
      label: 'View Queue',
      icon: Package,
      description: 'Manage pending items',
      onClick: () => onNavigate('queue'),
    },
    {
      label: 'Data Settings',
      icon: Upload,
      description: 'TCG database & intake config',
      onClick: () => onNavigate('data'),
    },
    {
      label: 'Webhooks',
      icon: Webhook,
      description: 'Shopify webhook setup',
      onClick: () => onNavigate('store'),
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="h-auto flex-col items-start gap-1 p-3 text-left"
            onClick={action.onClick}
          >
            <div className="flex items-center gap-2">
              <action.icon className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">{action.label}</span>
            </div>
            <span className="text-xs text-muted-foreground font-normal">
              {action.description}
            </span>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
