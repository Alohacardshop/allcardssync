# Card Show Tool

The Card Show Tool is a comprehensive module for managing card show inventory and transactions, integrated with ALT (app.alt.xyz) for automated card data fetching.

## Features

- **ALT Integration**: Automatically fetch card details from ALT Research pages
- **Show Management**: Create and manage card shows with dates and locations
- **Location Tracking**: Manage multiple store locations
- **Transaction Tracking**: Record buy/sell transactions for each card with show attribution
- **Session Management**: Persistent ALT login sessions with cookie storage
- **User Preferences**: Set default shows and locations per user

## Access

Navigate to **Tools → Card Show Tool** from the main navigation bar.

## User Roles

The tool uses your existing Supabase authentication and role system:

- **Staff**: Can view and manage inventory, add items, record transactions, update settings
- **Admin**: Full access including show/location management and ALT session management

## Setup

### 1. Environment Variables

Add these to your Supabase Edge Function secrets (or `.env` if running locally):

```bash
ALT_EMAIL=your-alt-email@example.com
ALT_PASSWORD=your-alt-password
```

**Security Note**: These credentials are stored securely in Supabase secrets and only accessible to edge functions.

### 2. Assign Admin Role

To grant admin access to a user (for show/location/session management):

```sql
-- First, ensure user has staff role
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_UUID_HERE', 'staff'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Then grant admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_UUID_HERE', 'admin'::app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

Replace `USER_UUID_HERE` with the actual user UUID from `auth.users`.

### 3. Running Playwright (Development)

The Card Show Tool uses Playwright for web scraping ALT. 

**Note**: Playwright headful mode is not yet fully implemented in the current build. The scraping functionality will be added in a future update with proper Playwright edge function integration.

When implemented, it will:
- Run headful browser for login (to handle CAPTCHA/MFA)
- Save cookies for subsequent requests
- Allow manual intervention when authentication requires human input

## Database Schema

### Tables Created

1. **locations**: Store show locations
   - Fields: name, code, notes
   - RLS: Staff can view, admins can manage

2. **shows**: Card show events
   - Fields: name, location, start_date, end_date, location_id, notes
   - RLS: Staff can view, admins can manage

3. **user_profiles**: User preferences
   - Fields: user_id, default_show_id, default_location_id
   - RLS: Users can manage their own profile

4. **alt_items**: Card data from ALT
   - Fields: alt_uuid, alt_url, title, grade, grading_service, set_name, year, population, image_url, alt_value, alt_checked_at, alt_notes
   - RLS: Staff can view and manage

5. **card_transactions**: Buy/sell transactions
   - Fields: alt_item_id, show_id, txn_type ('BUY'/'SELL'), price, txn_date, notes
   - RLS: Staff can view and manage

6. **scrape_sessions**: ALT session tracking
   - Fields: service ('ALT'), status, last_login_at, last_cookie_refresh_at, message
   - RLS: Admins only

## Usage Guide

### Dashboard

View all cards with:
- Search by title
- Filter by grading service, grade, show, location
- View ALT value (with last checked date)
- See latest buy/sell prices
- Export to CSV

Actions per card:
- **Refresh from ALT**: Update ALT value and data
- **Edit ALT**: Manually update ALT value and notes
- **Add BUY/SELL**: Record a transaction

### Add Items

1. Paste ALT Research URLs (one per line)
2. Optionally set default buy/sell prices
3. Submit to fetch data from ALT
4. View processing results (success/failed count)

**Format**: `https://app.alt.xyz/research/...`

### Shows (Admin)

- Create new shows with name, location, dates, notes
- Link shows to locations
- View transaction summaries per show
- Set as your default show

### Locations (Admin)

- Create locations with name, code, notes
- Edit existing locations
- View all locations used across shows

### Sessions (Admin)

Manage ALT authentication:
- **Login**: Initiate Playwright login flow
- **Status**: View current session state (ready/needs-human/expired/error)
- **Continue**: Finalize manual login after CAPTCHA/MFA

Session statuses:
- `ready`: Session active, scraping available
- `needs-human`: Manual login required (CAPTCHA/MFA)
- `expired`: Session expired, needs refresh
- `error`: Login failed

### Settings (User)

Set personal defaults:
- **Default Show**: Auto-select this show for new transactions
- **Default Location**: Auto-select this location

These are stored per-user and persist across sessions.

## API Endpoints (Future Implementation)

When edge functions are fully implemented, the following endpoints will be available:

### Sessions
- `GET /sessions` - Get ALT session status
- `POST /sessions/login` - Initiate Playwright login
- `POST /sessions/continue` - Finalize manual login

### Items
- `POST /fetchAlt` - Fetch cards from ALT URLs
- `POST /items/:id/refresh` - Refresh single card from ALT
- `PATCH /items/:id` - Update ALT value/notes

### Transactions
- `POST /items/:id/transactions` - Add BUY/SELL transaction

### Shows & Locations
- `GET /shows` - List all shows
- `POST /shows` - Create show (admin)
- `PATCH /shows/:id` - Update show (admin)
- `GET /locations` - List all locations
- `POST /locations` - Create location (admin)
- `PATCH /locations/:id` - Update location (admin)

### Profile
- `GET /profile` - Get user profile
- `PATCH /profile` - Update default show/location

## Keyboard Shortcuts

- `/` - Focus search
- `N` - Open Add Items (when implemented)

## UX Features

- **Grade Badge Colors**:
  - Green: Gem 10/9.5
  - Amber/Yellow: 9
  - Red: <9

- **Toast Notifications**: Actions show success/error toasts
- **Local Storage**: Last selected show/location persists
- **Responsive Design**: Works on desktop and mobile

## Security

- All ALT credentials stored securely in Supabase secrets
- Row Level Security (RLS) policies enforce access control
- Admin-only actions for sensitive operations
- Session cookies stored server-side only

## Troubleshooting

### Items Not Fetching from ALT

1. Check ALT session status in Sessions tab (admin)
2. Ensure `ALT_EMAIL` and `ALT_PASSWORD` secrets are set
3. Try manual login if session is `expired` or `needs-human`

### "Access Denied" Errors

- Verify you have `staff` role in `user_roles` table
- Check admin permissions for admin-only features
- Contact your system administrator

### Missing Shows/Locations

- Admins must create shows and locations first
- Check you have the `admin` role for creation access

## Future Enhancements

- [ ] Complete Playwright edge function integration
- [ ] Bulk card import from CSV
- [ ] Advanced filtering (date ranges, price ranges)
- [ ] Show profit/loss reports
- [ ] Email notifications for high-value cards
- [ ] Mobile app integration

## Support

For issues or feature requests, contact your system administrator or development team.

---

**Version**: 1.0  
**Last Updated**: 2025-01-06
