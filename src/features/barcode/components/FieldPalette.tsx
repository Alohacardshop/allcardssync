import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Type, 
  Hash, 
  DollarSign, 
  CheckCircle, 
  Barcode, 
  Folder,
  Calendar,
  User,
  Plus,
  Minus
} from 'lucide-react';
import type { LabelLayout, LabelField, FieldKey } from '../types/labelLayout';
import { FIELD_LABELS } from '../types/labelLayout';
import { cn } from '@/lib/utils';

interface FieldPaletteProps {
  layout: LabelLayout;
  onToggleField: (fieldKey: FieldKey, enabled: boolean) => void;
  onAddField: (fieldKey: FieldKey) => void;
}

const FIELD_ICONS: Record<FieldKey, React.ComponentType<{ className?: string }>> = {
  title: Type,
  sku: Hash,
  price: DollarSign,
  condition: CheckCircle,
  barcode: Barcode,
  set: Folder,
  cardNumber: Hash,
  year: Calendar,
  vendor: User,
};

const DEFAULT_FIELD_CONFIG: Record<FieldKey, Partial<LabelField>> = {
  title: { width: 260, height: 40, maxFontSize: 28, minFontSize: 14, alignment: 'left' },
  sku: { width: 150, height: 24, maxFontSize: 18, minFontSize: 12, alignment: 'left' },
  price: { width: 118, height: 45, maxFontSize: 36, minFontSize: 20, alignment: 'right' },
  condition: { width: 152, height: 50, maxFontSize: 24, minFontSize: 10, alignment: 'center' },
  barcode: { width: 260, height: 70, maxFontSize: 50, minFontSize: 30, alignment: 'center' },
  set: { width: 150, height: 24, maxFontSize: 16, minFontSize: 10, alignment: 'left' },
  cardNumber: { width: 80, height: 24, maxFontSize: 16, minFontSize: 10, alignment: 'left' },
  year: { width: 60, height: 20, maxFontSize: 14, minFontSize: 10, alignment: 'left' },
  vendor: { width: 120, height: 20, maxFontSize: 14, minFontSize: 10, alignment: 'left' },
};

export const FieldPalette: React.FC<FieldPaletteProps> = ({
  layout,
  onToggleField,
  onAddField,
}) => {
  const allFieldKeys: FieldKey[] = ['title', 'sku', 'price', 'condition', 'barcode', 'set', 'cardNumber', 'year', 'vendor'];
  
  const getFieldState = (fieldKey: FieldKey): { exists: boolean; enabled: boolean } => {
    const field = layout.fields.find(f => f.fieldKey === fieldKey);
    return {
      exists: !!field,
      enabled: field?.enabled ?? false,
    };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Field Palette
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {allFieldKeys.map((fieldKey) => {
          const Icon = FIELD_ICONS[fieldKey];
          const state = getFieldState(fieldKey);
          
          return (
            <div
              key={fieldKey}
              className={cn(
                'flex items-center justify-between p-2 rounded-lg border transition-colors',
                state.enabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-transparent'
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('w-4 h-4', state.enabled ? 'text-primary' : 'text-muted-foreground')} />
                <span className={cn('text-sm font-medium', !state.enabled && 'text-muted-foreground')}>
                  {FIELD_LABELS[fieldKey]}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {state.exists ? (
                  <Switch
                    checked={state.enabled}
                    onCheckedChange={(checked) => onToggleField(fieldKey, checked)}
                    className="scale-75"
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onAddField(fieldKey)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Toggle fields on/off or add new ones. Drag to position on canvas.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
