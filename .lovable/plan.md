

## Problem

The Radix Accordion internally manages pointer events in a way that interferes with the Radix Switch inside `AccordionContent`. Even with `stopPropagation` on various events, the Switch doesn't receive hover/pointer states properly — the cursor doesn't even change to pointer on hover.

## Solution

Replace the `Switch` component with a `Checkbox` for boolean fields inside the accordion. Checkboxes work reliably inside accordions and provide the same functionality. Alternatively, we can add explicit `style={{ position: 'relative', zIndex: 50, pointerEvents: 'auto' }}` and `className="cursor-pointer"` to the Switch — but the cleanest fix is:

**Keep the Switch but force pointer-events and z-index on the wrapper:**

In `RegionSettingsEditor.tsx`, update the boolean `case` to:
1. Add `relative z-50` and `pointer-events: auto` styling to the Switch wrapper div
2. Add `className="relative z-50 pointer-events-auto cursor-pointer"` directly to the `<Switch>` component  
3. Remove the container-level `onClick`/`onPointerDown` stopPropagation (which may be interfering) and instead only use `onPointerDownCapture` on the Switch itself

If that still fails (Radix internals), fall back to replacing `<Switch>` with a styled `<Button>` toggle that shows ON/OFF state — this completely avoids the Radix Switch + Radix Accordion conflict.

