import { useAllRegionSettings } from '@/hooks/useRegionSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface StatusItem {
  label: string;
  configured: boolean;
  warning?: boolean;
}

export function ConfigurationStatus() {
  const { settingsByRegion, isLoading } = useAllRegionSettings();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuration Status</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const getRegionStatus = (regionId: string): StatusItem[] => {
    const settings = settingsByRegion[regionId] || {};
    return [
      {
        label: 'Discord',
        configured: !!settings['discord.webhook_url'] && settings['discord.enabled'] === true,
        warning: !!settings['discord.webhook_url'] && !settings['discord.enabled'],
      },
      {
        label: 'eBay',
        configured: settings['ebay.auto_sync_enabled'] === true,
      },
      {
        label: 'Branding',
        configured: !!settings['branding.display_name'] || !!settings['branding.accent_color'],
      },
    ];
  };

  const regions = [
    { id: 'hawaii', name: 'Hawaii', icon: '🌺' },
    { id: 'las_vegas', name: 'Las Vegas', icon: '🎰' },
  ];

  const StatusIcon = ({ configured, warning }: { configured: boolean; warning?: boolean }) => {
    if (warning) return <AlertCircle className="h-3.5 w-3.5 text-warning" />;
    if (configured) return <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;
    return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Configuration Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {regions.map((region) => {
          const statuses = getRegionStatus(region.id);
          const configuredCount = statuses.filter(s => s.configured).length;
          
          return (
            <div key={region.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <span>{region.icon}</span>
                  {region.name}
                </span>
                <Badge variant={configuredCount === statuses.length ? 'default' : 'secondary'} className="text-xs">
                  {configuredCount}/{statuses.length}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {statuses.map((status) => (
                  <div
                    key={status.label}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <StatusIcon configured={status.configured} warning={status.warning} />
                    <span>{status.label}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
