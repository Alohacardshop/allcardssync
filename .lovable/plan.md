

## Deep Dive: PIN Login Authentication System

### How It Works

The app uses a **PIN-based login** system via a Supabase Edge Function (`pin-login`):

1. User enters their **display name** → frontend sends it to the edge function
2. Edge function looks up the name in the `staff_pins` table (case-insensitive)
3. User enters a **4-digit PIN** → edge function hashes it with the stored salt and compares
4. On success, it calls `supabase.auth.admin.generateLink({ type: "magiclink" })` to get a `hashed_token`
5. Frontend receives the `tokenHash` and calls `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })` to create a browser session

### Current Status

| Check | Status |
|-------|--------|
| Edge function deployed | Yes, `verify_jwt = false` (correct for public login) |
| CORS headers | Present and correct |
| Status codes (our recent fix) | All handled errors now return `200` |
| Zach's `staff_pins` record | Exists, `display_name: "zach"`, `failed_attempts: 0`, not locked |
| Zach's auth user | Exists (`a95dfa6d...`), email: `lasvegas@alohacardshop.com` |
| Zach's `last_sign_in_at` | **`null`** — he has never successfully signed in |

### The Problem

**Zach's login attempts are not reaching the edge function at all.** The edge function logs show zero requests for "zach" or "Zach" — only my test attempts for "test" appear. This means the request is failing *before* it hits the server.

The most likely cause: **Zach is using the published app (`alohacardshop.lovable.app`), which has not been re-published since we changed `Auth.tsx`** from a raw `fetch()` call to `supabase.functions.invoke()`. If the published app still has the old code, it may be hitting a wrong endpoint or encountering a different error path.

### What Needs to Happen

1. **Publish the latest code** — The fixes to `Auth.tsx` (using `supabase.functions.invoke`) and `pin-login/index.ts` (returning `200` for all handled errors) need to be deployed to the published app. The edge function auto-deploys, but the frontend code requires a manual publish.

2. **Have Zach retry on the published app** after publishing.

3. **If it still fails**, the issue could be that `verifyOtp` with `token_hash` + `type: "magiclink"` doesn't work as expected with Supabase's current auth API. Zach's `last_sign_in_at` being `null` confirms the OTP verification step has never completed for any user via this flow. We may need to test this path end-to-end with a known PIN.

### No Code Changes Needed

This is a **publish/deploy issue**, not a code issue. The edge function fixes are already in place. The frontend fixes are already in the codebase. They just need to be published to production.

