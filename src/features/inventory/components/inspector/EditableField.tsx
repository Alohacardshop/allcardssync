import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditableFieldProps {
  label: string;
  value: string | number | null | undefined;
  type?: 'text' | 'number' | 'currency';
  onSave: (value: string | number) => void;
  disabled?: boolean;
  className?: string;
}

export const EditableField = React.memo(({
  label,
  value,
  type = 'text',
  onSave,
  disabled,
  className,
}: EditableFieldProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    if (disabled) return;
    const displayValue = type === 'currency'
      ? (Number(value) || 0).toFixed(2)
      : String(value ?? '');
    setDraft(displayValue);
    setEditing(true);
  }, [disabled, value, type]);

  const cancel = useCallback(() => {
    setEditing(false);
  }, []);

  const save = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (type === 'currency' || type === 'number') {
      const num = parseFloat(trimmed);
      if (isNaN(num)) return;
      if (num === Number(value)) return; // no change
      onSave(num);
    } else {
      if (trimmed === String(value ?? '')) return; // no change
      onSave(trimmed);
    }
  }, [draft, value, type, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    else if (e.key === 'Escape') cancel();
  }, [save, cancel]);

  const displayValue = type === 'currency'
    ? `$${(Number(value) || 0).toFixed(2)}`
    : String(value ?? '—');

  if (editing) {
    return (
      <div className={className}>
        <span className="text-xs text-muted-foreground block mb-0.5">{label}</span>
        <div className="flex items-center gap-1">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={save}
            type={type === 'currency' || type === 'number' ? 'number' : 'text'}
            step={type === 'currency' ? '0.01' : undefined}
            className="h-7 text-sm px-2"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group cursor-pointer rounded px-1 -mx-1 transition-colors',
        !disabled && 'hover:bg-muted/50',
        className
      )}
      onClick={startEdit}
    >
      <span className="text-xs text-muted-foreground block">{label}</span>
      <div className="flex items-center gap-1.5">
        <p className={cn(
          'text-sm',
          type === 'currency' && 'font-semibold tabular-nums text-lg',
          type === 'number' && 'font-semibold tabular-nums text-lg',
        )}>
          {displayValue}
        </p>
        {!disabled && (
          <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
});

EditableField.displayName = 'EditableField';
