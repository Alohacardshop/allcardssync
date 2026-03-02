

## Problem
The eBay switch is technically rendering but becomes effectively invisible when the error box appears. The current vertical stack layout means the error box (which can be quite tall with long messages) dominates the small inspector panel, making the switch hard to find. The real fix isn't just contrast — it's the layout itself.

## Redesigned EbayTab Layout

Restructure `EbayTab.tsx` into a more compact, always-visible layout:

**Top row — always visible, prominent:**
- Left: "eBay" label + status badge (Listed / Error / Queued / Off)
- Right: Switch toggle — always in the same spot, never pushed around

**Error alert — compact, collapsible:**
- If there's an error, show a single-line summary with the error text truncated
- Use a small inline destructive badge instead of a full block
- Keep it to 1-2 lines max so it doesn't dominate

**Listing details — below, only when listed:**
- Listing ID + View on eBay link (compact row)

**Remove the "Not enabled for eBay" empty state block** — the switch + status badge already communicate this. The empty state just wastes space.

### File changes

**`src/features/inventory/components/inspector/tabs/EbayTab.tsx`** — Full rewrite of the template:
- Move Switch to a single-line header row alongside status badge
- Replace the tall error block with a compact 1-2 line inline error (truncated with title tooltip for full text)
- Remove the redundant "Not enabled" empty state
- Keep listing details compact

This makes the switch always visible at the top regardless of error state, and prevents the error from dominating the small panel.

