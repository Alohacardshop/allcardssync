import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { StockModeConfig, saveStockModeConfig } from '@/lib/printService';

interface StockModeSelectorProps {
  config: StockModeConfig;
  onChange: (config: StockModeConfig) => void;
}

export function StockModeSelector({ config, onChange }: StockModeSelectorProps) {
  const handleModeChange = (isContinuous: boolean) => {
    const newConfig = {
      ...config,
      mode: isContinuous ? 'continuous' as const : 'gap' as const
    };
    onChange(newConfig);
    saveStockModeConfig(newConfig);
  };

  const handleSpeedChange = (speed: number) => {
    const newConfig = { ...config, speed };
    onChange(newConfig);
    saveStockModeConfig(newConfig);
  };

  const handleDarknessChange = (darkness: number) => {
    const newConfig = { ...config, darkness };
    onChange(newConfig);
    saveStockModeConfig(newConfig);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Print Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stock Mode */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label>Stock Mode</Label>
            <p className="text-sm text-muted-foreground">
              {config.mode === 'gap' ? 'Gap/Notch (^MNY)' : 'Continuous (^MNN)'}
            </p>
          </div>
          <Switch 
            checked={config.mode === 'continuous'}
            onCheckedChange={handleModeChange}
          />
        </div>

        {/* Speed */}
        <div className="space-y-2">
          <Label>Speed (IPS): {config.speed}</Label>
          <input
            type="range"
            min="2"
            max="6"
            value={config.speed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Darkness */}
        <div className="space-y-2">
          <Label>Darkness: {config.darkness}</Label>
          <input
            type="range"
            min="0"
            max="30"
            value={config.darkness}
            onChange={(e) => handleDarknessChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}