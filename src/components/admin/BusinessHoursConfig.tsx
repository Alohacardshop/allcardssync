import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Clock } from 'lucide-react';

export interface BusinessHoursData {
  timezone: string;
  start: string;   // "HH:MM"
  end: string;      // "HH:MM"
  active_days: number[]; // 0=Sun … 6=Sat
}

const DAYS = [
  { value: '0', label: 'Sun' },
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
];

const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/New_York', label: 'Eastern (ET)' },
];

const DEFAULT_CONFIG: BusinessHoursData = {
  timezone: 'Pacific/Honolulu',
  start: '08:00',
  end: '19:00',
  active_days: [1, 2, 3, 4, 5, 6],
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

interface Props {
  regionId: string;
  regionLabel: string;
  initialData: BusinessHoursData | null;
  onSaved?: (data: BusinessHoursData) => void;
}

export function BusinessHoursConfig({ regionId, regionLabel, initialData, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<BusinessHoursData>(() => {
    if (!initialData) return DEFAULT_CONFIG;
    return {
      timezone: initialData.timezone || DEFAULT_CONFIG.timezone,
      start: typeof initialData.start === 'string' ? initialData.start : DEFAULT_CONFIG.start,
      end: typeof initialData.end === 'string' ? initialData.end : DEFAULT_CONFIG.end,
      active_days: Array.isArray(initialData.active_days) ? initialData.active_days : DEFAULT_CONFIG.active_days,
    };
  });
  const [errors, setErrors] = useState<string[]>([]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!TIME_RE.test(config.start)) errs.push('Start time must be HH:MM (24-hour)');
    if (!TIME_RE.test(config.end)) errs.push('End time must be HH:MM (24-hour)');
    if (config.active_days.length === 0) errs.push('At least one active day is required');
    if (!config.timezone) errs.push('Timezone is required');
    // We allow start > end (overnight window) — just warn
    return errs;
  };

  const isOvernight = TIME_RE.test(config.start) && TIME_RE.test(config.end) && config.start >= config.end && config.start !== config.end;

  const save = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('region_settings')
        .upsert(
          {
            region_id: regionId,
            setting_key: 'operations.business_hours',
            setting_value: config as any,
          },
          { onConflict: 'region_id,setting_key' }
        );
      if (error) throw error;
      toast({ title: 'Saved', description: `Business hours updated for ${regionLabel}` });
      onSaved?.(config);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Business Hours — {regionLabel}
        </CardTitle>
        <CardDescription>
          Discord notifications only send during these hours. Outside this window they queue and flush when the next active period opens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Timezone */}
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={config.timezone} onValueChange={(v) => setConfig((c) => ({ ...c, timezone: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start / End */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`bh-start-${regionId}`}>Start Time (24h)</Label>
            <Input
              id={`bh-start-${regionId}`}
              placeholder="08:00"
              value={config.start}
              onChange={(e) => setConfig((c) => ({ ...c, start: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`bh-end-${regionId}`}>End Time (24h)</Label>
            <Input
              id={`bh-end-${regionId}`}
              placeholder="19:00"
              value={config.end}
              onChange={(e) => setConfig((c) => ({ ...c, end: e.target.value }))}
            />
          </div>
        </div>
        {isOvernight && (
          <p className="text-xs text-amber-500">
            ⚠ Overnight window detected ({config.start}→{config.end}). Notifications will send from {config.start} until midnight, then midnight until {config.end} on the <em>next</em> active day.
          </p>
        )}

        {/* Active Days */}
        <div className="space-y-1.5">
          <Label>Active Days</Label>
          <ToggleGroup
            type="multiple"
            className="justify-start flex-wrap"
            value={config.active_days.map(String)}
            onValueChange={(vals) => setConfig((c) => ({ ...c, active_days: vals.map(Number).sort() }))}
          >
            {DAYS.map((d) => (
              <ToggleGroupItem key={d.value} value={d.value} className="px-3">
                {d.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Select which days notifications are sent immediately. Unselected days will queue.
          </p>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="text-sm text-destructive space-y-1">
            {errors.map((e, i) => (
              <p key={i}>• {e}</p>
            ))}
          </div>
        )}

        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Save Business Hours'}
        </Button>
      </CardContent>
    </Card>
  );
}
