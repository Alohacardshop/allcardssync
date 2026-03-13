

## User Management & Login Review

### Current Architecture Summary

- **User creation**: Admin creates users via `create-user-admin` edge function (assigns roles + store locations)
- **Login**: Standard email/password via `supabase.auth.signInWithPassword` on `/auth`
- **Authorization**: `AuthContext` fetches roles via `verify_user_access` RPC, `AuthGuard` blocks non-staff/non-admin
- **Password reset**: Admin resets via `reset-user-password` edge function, new password shown in toast

### Issues Found

**1. Password reset shows in a toast that auto-dismisses (CRITICAL)**
Line 540: `toast.success(\`Password reset... New password: ${data.newPassword}\`)` — the toast disappears after a few seconds. The admin can't copy the password. This is almost certainly why Cyrus couldn't log in — the admin likely misread or partially copied the password.

**Fix**: Replace the toast with a persistent dialog containing a copy-to-clipboard button.

**2. Password reset error handling doesn't extract edge function error body**
Lines 537-538 in `handleResetPassword` don't parse `FunctionsHttpError` context (unlike the create-user flow which was already fixed). If the edge function returns a non-2xx, you get the generic message.

**Fix**: Apply the same `error.context?.json?.()` pattern used in user creation.

**3. Sign-up mode is publicly visible on the auth page**
The auth page has a "Don't have an account? Sign up" toggle. Anyone can create an account in `auth.users`, even though `AuthGuard` blocks them without a role. This creates orphan accounts and could be confusing.

**Fix**: Remove the sign-up toggle and form. Users should only be created via the admin panel.

**4. Delete user error handling also missing error body extraction**
`handleDeleteUser` (line 474) doesn't extract the error body from `FunctionsHttpError`.

**Fix**: Same pattern as above.

### Implementation Plan

1. **Add a password reveal dialog** — when password reset succeeds, show a modal with the new password, a copy button, and a "Done" button. Keep it on screen until the admin explicitly closes it.

2. **Remove self-signup from Auth.tsx** — remove the mode toggle, sign-up form, and related state. Keep only the sign-in form.

3. **Fix error handling** on `handleResetPassword` and `handleDeleteUser` to extract the actual error from edge function responses.

### Files to Change

- `src/components/UserAssignmentManager.tsx` — password dialog, error handling fixes
- `src/pages/Auth.tsx` — remove sign-up mode

