import React from 'react';
import { cn } from '@/lib/utils';

interface MeasurementTooltipProps {
  visible: boolean;
  position: { x: number; y: number };
  measurements: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  scale: number;
}

export function MeasurementTooltip({
  visible,
  position,
  measurements,
  scale
}: MeasurementTooltipProps) {
  if (!visible) return null;

  const formatValue = (value: number) => Math.round(value).toString();

  return (
    <div
      className={cn(
        'absolute pointer-events-none z-30 transition-all duration-200',
        'bg-popover border border-border rounded-md shadow-lg p-2',
        'text-xs font-mono text-popover-foreground',
        'opacity-90'
      )}
      style={{
        left: position.x * scale + 10,
        top: position.y * scale - 40,
        transform: position.x > 200 ? 'translateX(-100%)' : 'none'
      }}
    >
      <div className="flex flex-col gap-1">
        {measurements.x !== undefined && (
          <div>X: {formatValue(measurements.x)}</div>
        )}
        {measurements.y !== undefined && (
          <div>Y: {formatValue(measurements.y)}</div>
        )}
        {measurements.width !== undefined && (
          <div>W: {formatValue(measurements.width)}</div>
        )}
        {measurements.height !== undefined && (
          <div>H: {formatValue(measurements.height)}</div>
        )}
      </div>
    </div>
  );
}