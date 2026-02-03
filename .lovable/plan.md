

## Implementing 3 UI Polish Features

Based on your request, I'll implement these three improvements:
1. **Priority status borders** on InventoryItemCard
2. **Animated number counters** on DashboardHome stats
3. **Toast undo support** for destructive actions

---

### 1. Priority Status Borders on Inventory Cards

Add a colored left border (4px) to each inventory card that instantly communicates sync status:

| Status | Border Color | Visual Meaning |
|--------|--------------|----------------|
| Error | `destructive` (red) | Needs attention |
| Synced | `green-500` | Good to go |
| Queued/Processing | `blue-500` | In progress |
| Pending | `amber-500` | Waiting |
| Not synced | Transparent | Default |

**File: `src/components/InventoryItemCard.tsx`**

Update the Card component (around line 267) to add dynamic border classes:
```tsx
<Card 
  className={cn(
    "transition-all duration-200 border-l-4",
    item.shopify_sync_status === 'error' && "border-l-destructive",
    item.shopify_sync_status === 'synced' && item.shopify_product_id && "border-l-green-500",
    (item.shopify_sync_status === 'queued' || item.shopify_sync_status === 'processing') && "border-l-blue-500",
    item.shopify_sync_status === 'pending' && "border-l-amber-500",
    !item.shopify_sync_status && "border-l-transparent",
    isSelected && "ring-2 ring-primary",
    item.deleted_at && "opacity-50"
  )}
  onMouseEnter={handleMouseEnter}
>
```

---

### 2. Animated Number Counters on Dashboard Stats

Create a reusable hook that animates numbers counting up when they change (like Stripe's dashboard).

**New File: `src/hooks/useAnimatedCounter.ts`**
```typescript
import { useState, useEffect, useRef } from 'react';

export function useAnimatedCounter(
  targetValue: number,
  duration: number = 500,
  enabled: boolean = true
) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  const animationFrame = useRef<number>();

  useEffect(() => {
    if (!enabled || targetValue === previousValue.current) return;

    const startValue = previousValue.current;
    const diff = targetValue - startValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth deceleration
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(startValue + diff * easeOutCubic);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrame.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = targetValue;
      }
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [targetValue, duration, enabled]);

  return displayValue;
}
```

**File: `src/pages/DashboardHome.tsx`**

Update the `StatCard` component to use animated counters:
```tsx
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';

function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  isLoading,
}: { 
  label: string; 
  value: string | number; 
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
}) {
  const numericValue = typeof value === 'number' ? value : parseInt(value.toString(), 10) || 0;
  const animatedValue = useAnimatedCounter(numericValue, 600, !isLoading);
  
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {animatedValue.toLocaleString()}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

The `tabular-nums` class ensures numbers don't jump around during animation.

---

### 3. Toast Undo Support for Destructive Actions

Add undo functionality to delete operations using Sonner's built-in action support.

**File: `src/pages/Inventory.tsx`**

Update the delete handler (around line 1095-1099) to include an undo action:
```tsx
if (successful > 0) {
  const message = shopifyRemoved > 0 
    ? `Deleted ${successful} item${successful > 1 ? 's' : ''} (${shopifyRemoved} from Shopify)`
    : `Deleted ${successful} item${successful > 1 ? 's' : ''}`;
  
  toast.success(message, {
    action: {
      label: 'Undo',
      onClick: async () => {
        try {
          // Restore soft-deleted items
          await supabase
            .from('intake_items')
            .update({ 
              deleted_at: null, 
              deleted_reason: null,
              updated_at: new Date().toISOString()
            })
            .in('id', itemIds);
          
          toast.success('Items restored');
          refetch();
        } catch (error: any) {
          toast.error('Failed to restore items');
        }
      },
    },
    duration: 8000, // Longer duration to give time to undo
  });
}
```

---

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useAnimatedCounter.ts` | Create | Reusable animated number hook |
| `src/pages/DashboardHome.tsx` | Modify | Use animated counters in StatCard |
| `src/components/InventoryItemCard.tsx` | Modify | Add priority status borders |
| `src/pages/Inventory.tsx` | Modify | Add undo support to delete toast |

---

### Visual Impact Summary

| Feature | Before | After |
|---------|--------|-------|
| Status Borders | No visual priority | Instant color-coded status at card edge |
| Number Counters | Static numbers | Smooth count-up animation on load/change |
| Delete Toasts | "Items deleted" message | "Items deleted" + Undo button for 8 seconds |

These changes follow the patterns from Linear (instant feedback), Stripe (animated dashboards), and Gmail/Slack (undo for destructive actions).

