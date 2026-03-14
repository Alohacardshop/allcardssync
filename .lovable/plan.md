

## Assessment: Current Auth System

The current login system works but is significantly over-engineered for a staff-only internal tool. Here's what's wrong:

### Problems

1. **Auth.tsx is ~300 lines for a simple email/password form.** It uses 6 refs, 3 timers, a cancellation system, and attempt IDs — all to handle a race condition between `onAuthStateChange` and a role check. This complexity exists because the page duplicates work that `AuthContext` + `AuthGuard` already handle.

2. **No forgot-password flow.** Staff who forget passwords are locked out with no self-service option. The admin must manually reset via the panel, and that edge function (`reset-user-password`) was previously undeployed.

3. **The `reset-user-password` edge function is missing from `config.toml`.** It exists in code but was never registered, so it can't be deployed.

4. **Error messages are developer-oriented**, not staff-friendly ("Invalid login credentials" means nothing to a shop employee).

5. **Auth.tsx re-implements session detection** that `AuthContext` already provides via `useAuth()`.

### What's actually needed for a staff-only internal tool

- Email + password sign-in (already have)
- "Forgot password" email reset (missing)
- Admin-created accounts only, no public signup (already enforced)
- Role check before dashboard access (already have via `AuthGuard`)
- Clear error messages for staff

---

## Plan

### 1. Simplify Auth.tsx (~300 lines → ~80 lines)

Strip out all the ref/timer/cancellation machinery. The page should only do:
- Render an email + password form
- Call `supabase.auth.signInWithPassword()`
- On success, navigate to `/` — `AuthGuard` handles the role check
- On error, show a staff-friendly message
- Add a "Forgot password?" link

The current `AuthContext` + `AuthGuard` already handles session detection and role verification on every protected route. Auth.tsx does not need to duplicate that.

### 2. Add forgot-password flow (two pieces)

**a) "Forgot Password" trigger on Auth.tsx:**
- Toggle between sign-in and forgot-password views
- Call `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- Show confirmation message

**b) New `/reset-password` page:**
- Detects `type=recovery` from the URL hash (Supabase redirect)
- Shows a "set new password" form
- Calls `supabase.auth.updateUser({ password })`
- Redirects to `/auth` on success

**c) Add route to `public.tsx`** and path to `paths.ts`.

### 3. Register `reset-user-password` in config.toml

Add the missing entry so the admin panel's password reset actually works too.

### 4. Staff-friendly error messages

Map Supabase error strings to plain language:
- "Invalid login credentials" → "Incorrect email or password. Try again or use Forgot Password below."
- "Email not confirmed" → "Your account hasn't been activated yet. Contact your admin."
- Generic fallback → "Something went wrong. Try again or contact your admin."

### 5. Clean up unused auth helpers

- Remove `useSession.ts` (unused — `AuthContext` provides the session)
- Simplify `cleanupAuthState` in `auth.ts` (keep, but it's only used on sign-out)

---

### Files changed

| File | Action |
|------|--------|
| `src/pages/Auth.tsx` | Rewrite: ~80 lines, simple form + forgot-password toggle |
| `src/pages/ResetPassword.tsx` | **New**: password reset landing page |
| `src/routes/paths.ts` | Add `resetPassword: '/reset-password'` |
| `src/routes/public.tsx` | Add route for `/reset-password` |
| `supabase/config.toml` | Add `[functions.reset-user-password]` entry |
| `src/hooks/useSession.ts` | Delete (unused) |

No database changes. No edge function code changes. No changes to `AuthContext` or `AuthGuard` — they work correctly as-is.

