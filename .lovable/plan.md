

## Hide FloatingActionButton on Mobile

A quick fix to prevent overlap between the FloatingActionButton and the BottomNav on mobile screens.

---

### The Problem

The FloatingActionButton (FAB) sits at `bottom-6 right-6`, which overlaps with the BottomNav on mobile devices. Since BottomNav already provides navigation on mobile, the FAB is redundant and creates visual clutter.

---

### The Fix

Add `hidden md:block` to the FAB container so it:
- **Hidden on mobile** (< 768px) - BottomNav handles navigation
- **Visible on desktop** (≥ 768px) - FAB provides quick actions

---

### File to Modify

**`src/components/FloatingActionButton.tsx`** (line 44)

```tsx
// Before:
<div className="fixed bottom-6 right-6 z-50">

// After:
<div className="hidden md:flex fixed bottom-6 right-6 z-50 flex-col items-end">
```

Note: Changed to `md:flex` and added `flex-col items-end` to maintain proper flexbox behavior when visible.

---

### Why This Works

- Uses the same `md:` breakpoint (768px) as the `useIsMobile` hook
- Matches the BottomNav visibility logic (BottomNav shows when `isMobile`, FAB shows when not mobile)
- Zero JavaScript overhead - pure CSS solution

