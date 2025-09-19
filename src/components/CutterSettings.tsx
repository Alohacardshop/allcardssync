import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Scissors } from 'lucide-react';

export interface CutterConfig {
  cutAfter: boolean;
  cutTiming: 'after-each' | 'after-interval' | 'end-of-job';
  cutInterval: number;
  hasCutter: boolean;
}

interface CutterSettingsProps {
  config: CutterConfig;
  onChange: (config: CutterConfig) => void;
}

export function CutterSettings({ config, onChange }: CutterSettingsProps) {
  const handleToggleCutter = (hasCutter: boolean) => {
    onChange({ ...config, hasCutter, cutAfter: hasCutter ? config.cutAfter : false });
  };

  const handleToggleCutting = (cutAfter: boolean) => {
    onChange({ ...config, cutAfter });
  };

  const handleCutTimingChange = (value: string) => {
    onChange({ ...config, cutTiming: value as 'after-each' | 'after-interval' | 'end-of-job' });
  };

  const handleCutIntervalChange = (value: string) => {
    onChange({ ...config, cutInterval: parseInt(value, 10) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-4 w-4" />
          Cutter Settings
        </CardTitle>
        <CardDescription>
          Configure automatic cutting for labels (requires printer with cutter)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Has Cutter Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Printer has cutter</Label>
            <p className="text-xs text-muted-foreground">
              Enable if your printer has an automatic cutter
            </p>
          </div>
          <Switch
            checked={config.hasCutter}
            onCheckedChange={handleToggleCutter}
          />
        </div>

        {/* Cutting Options - only show if printer has cutter */}
        {config.hasCutter && (
          <>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enable cutting</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically cut labels after printing
                </p>
              </div>
              <Switch
                checked={config.cutAfter}
                onCheckedChange={handleToggleCutting}
              />
            </div>

            {/* Cut Timing - only show if cutting is enabled */}
            {config.cutAfter && (
              <div className="space-y-2">
                <Label>Cut timing</Label>
                <Select value={config.cutTiming} onValueChange={handleCutTimingChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cut timing" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after-each">Cut after each label</SelectItem>
                    <SelectItem value="after-interval">Cut after interval</SelectItem>
                    <SelectItem value="end-of-job">Cut after all labels finished</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {config.cutTiming === 'after-each' && 'Labels cut individually'}
                  {config.cutTiming === 'after-interval' && 'Labels cut in groups'}
                  {config.cutTiming === 'end-of-job' && 'Cut only when all labels are printed'}
                </p>
              </div>
            )}

            {/* Cut Interval - only show if timing is 'after-interval' */}
            {config.cutAfter && config.cutTiming === 'after-interval' && (
              <div className="space-y-2">
                <Label>Cut interval</Label>
                <Select value={config.cutInterval.toString()} onValueChange={handleCutIntervalChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select cut interval" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">Cut after 2 labels</SelectItem>
                    <SelectItem value="5">Cut after 5 labels</SelectItem>
                    <SelectItem value="10">Cut after 10 labels</SelectItem>
                    <SelectItem value="20">Cut after 20 labels</SelectItem>
                    <SelectItem value="50">Cut after 50 labels</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Labels will be cut in groups of {config.cutInterval}
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}