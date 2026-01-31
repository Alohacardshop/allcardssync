
Goal
- Make the “Save” button in Region Settings (Staff Role ID / discord.role_id) reliably clickable and actually persist to Supabase.

What we know (from your confirmation + replay)
- Clicking Save does nothing (no spinner, no toast, no request).
- Other buttons (like Refresh) are clickable.
- Session replay indicates an invisible element (opacity 0 with an opacity transition) is sitting on top of the Save button area and intercepting clicks. This strongly points to a UI overlay/popup layer (most commonly Radix Tooltip/Popover/Sheet content) that remains in the DOM while fading out, but still captures pointer events.

Likely root cause
- A floating UI layer (very likely Radix Tooltip content) is positioned over the Save button and still has pointer-events enabled even when “closed” (opacity: 0).
- Because it’s above the Save button, your clicks never reach the button, so no save mutation runs (which matches “no network request” and the DB value staying empty).

Implementation plan (safe + robust)
1) Fix the overlay so it can’t block clicks
   - Update the shared Tooltip component (src/components/ui/tooltip.tsx) to ensure tooltips never intercept clicks:
     - Add `pointer-events-none` to `TooltipContent` so even if it’s visible/invisible, it won’t capture clicks.
     - Keep its z-index as-is (z-50) so it still displays visually above content, but it won’t block interactions.
   - Why this is the best “root fix”:
     - It fixes the actual cause (an overlay capturing pointer events), not just this one Save button.
     - Tooltips typically should not be interactive, so disabling pointer events is correct UX.

2) Add a belt-and-suspenders fix to the Save buttons (in case another overlay exists)
   - In src/components/admin/RegionSettingsEditor.tsx:
     - Update ALL Save buttons (boolean/number/color/json/password/default) to:
       - `type="button"` (prevents any form-submit edge cases)
       - Add `onPointerDownCapture={(e) => { e.stopPropagation(); }}` in addition to the existing click handler
         - PointerDownCapture fires earlier than click and helps avoid parent/overlay interactions stealing the event.
       - Increase z-index more aggressively (e.g. `relative z-50`) and add `pointer-events-auto`
     - Keep the existing `onClick` logic that calls `saveValue(...)`.

3) Add “did the save fire?” instrumentation (temporary but very helpful)
   - Still in RegionSettingsEditor.tsx:
     - Inside `saveValue`, add a short `console.log` like:
       - “Saving region setting”, { regionId, key, value }
     - Also add a visible inline status next to the Save button for that field:
       - “Saving…” while `isSaving`
       - “Saved” for ~2 seconds after success (local state)
       - “Failed: …” inline on error (in addition to toast)
   - Why:
     - If anything ever regresses, we’ll instantly know whether the click event reached React and whether Supabase rejected the write.

4) Verify persistence end-to-end
   - Manual verification steps (you can do immediately after we implement):
     1. Go to Admin → Regions → Hawaii → Discord Notifications → Staff Role ID
     2. Paste `852989670496272394`
     3. Click Save
     4. Confirm you see a visible “Saved” indicator (not just relying on toast)
     5. Click Refresh (or reload page)
     6. Confirm the value is still present
   - Backend verification (optional but definitive):
     - Check Supabase table `region_settings` row where:
       - region_id = hawaii
       - setting_key = discord.role_id
     - Confirm `setting_value` is now “852989670496272394” and `updated_at` is current.

Edge cases / follow-ups
- If you often run the sidebar in “collapsed” icon mode, Radix tooltips will appear frequently; the tooltip pointer-events fix is especially important then.
- If after tooltip fix the issue persists, we’ll repeat the same “pointer-events-none when closed” approach for any other overlay components we find (Popover, HoverCard, Sheet), but Tooltip is the top suspect given the opacity transition clue.

Files we expect to change
- src/components/ui/tooltip.tsx
  - Add `pointer-events-none` to TooltipContent className.
- src/components/admin/RegionSettingsEditor.tsx
  - Apply consistent button event handling + higher z-index to all Save buttons.
  - Add inline “Saved/Failed” feedback and a debug console.log.

Success criteria
- Clicking Save always triggers the save mutation (we can see “Saving…” UI state).
- Supabase `region_settings.discord.role_id` updates and persists after refresh.
- No other admin buttons regress.

