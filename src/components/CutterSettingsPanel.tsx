import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCutterSettings, type CutMode } from '@/hooks/useCutterSettings';
import { Scissors, Settings } from 'lucide-react';

export function CutterSettingsPanel() {
  const { settings, updateCutMode, updateEnableCutter } = useCutterSettings();

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          Cutter Settings
        </CardTitle>
        <CardDescription>
          Configure how the printer cutter behaves during label printing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enable-cutter">Enable Cutter</Label>
            <div className="text-sm text-muted-foreground">
              Turn on automatic cutting after printing
            </div>
          </div>
          <Switch
            id="enable-cutter"
            checked={settings.enableCutter}
            onCheckedChange={updateEnableCutter}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cut-mode">Cut Mode</Label>
          <Select
            value={settings.cutMode}
            onValueChange={(value: CutMode) => updateCutMode(value)}
            disabled={!settings.enableCutter}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select cut mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="batch">
                Batch Mode - Cut once after all labels
              </SelectItem>
              <SelectItem value="per_label">
                Per Label - Cut after each label
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground">
            {settings.cutMode === 'batch' 
              ? 'Cuts only after the last label in a batch job (^MCN)'
              : 'Cuts immediately after each individual label (^MCY)'
            }
          </div>
        </div>

        <div className="rounded-md bg-muted p-3 text-xs">
          <div className="font-medium mb-1">Current ZPL Commands:</div>
          <div className="font-mono space-y-1">
            <div>^MMC (Set print mode = Cutter)</div>
            <div>^CN1 (Enable cutter)</div>
            <div>
              {settings.enableCutter 
                ? settings.cutMode === 'per_label' 
                  ? '^MCY (Cut after every label)'
                  : '^MCN (Cut only after batch)'
                : '(No cut commands - cutter disabled)'
              }
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}