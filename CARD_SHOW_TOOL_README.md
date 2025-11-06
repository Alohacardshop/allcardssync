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

### 3. Automated Scraping Setup

**⚠️ Important Limitation**: Browser automation (Playwright) cannot run directly in Supabase Edge Functions because they don't support browser binaries. The edge functions and UI are fully functional, but automated scraping requires an external service.

#### Current Status

✅ **Implemented & Working:**
- Admin credential management
- Certificate lookup UI
- Database schema for ALT items
- Edge function infrastructure
- All UI components and navigation

❌ **Requires External Setup:**
- Automated browser scraping from ALT
- Playwright execution

#### Implementation Options

Choose one of these approaches to enable automated card lookups:

##### Option 1: External Scraping API (Recommended - Fastest Setup)

Use a managed scraping service that handles browser automation:

**Recommended Services:**
- **ScrapingBee** (https://www.scrapingbee.com/) - ~$50-100/month
- **Bright Data** (https://brightdata.com/) - Enterprise pricing
- **ScraperAPI** (https://www.scraperapi.com/) - ~$50-200/month

**Implementation Steps:**
1. Sign up for a scraping service and get API key
2. Add API key to Supabase secrets: `SCRAPING_SERVICE_API_KEY`
3. Update `card-show-fetch-alt` edge function to call the scraping API
4. The service handles browser rendering, returns HTML/JSON
5. Parse response and save to `alt_items` table

**Pros:** No server maintenance, handles CAPTCHAs, reliable, fast setup  
**Cons:** Monthly cost ($50-200), dependency on third party

##### Option 2: Self-Hosted Playwright Server

Deploy your own Node.js server with Playwright installed:

**Recommended Platforms:**
- Railway.app (https://railway.app/)
- Render.com (https://render.com/)
- Fly.io (https://fly.io/)

**Implementation Steps:**
1. Create a Node.js/Express server with Playwright
2. Add API endpoint: `POST /scrape` that accepts cert numbers
3. Deploy to cloud platform
4. Store server URL in Supabase secrets: `PLAYWRIGHT_SERVER_URL`
5. Update `card-show-fetch-alt` to call your server
6. Your server does scraping, returns data

**Pros:** Full control, no per-request costs, customizable  
**Cons:** Server maintenance, scaling complexity, uptime responsibility

##### Option 3: Manual Entry Fallback

No automation - staff manually enters card details:

**Implementation Steps:**
1. Keep current credential storage for future use
2. Add manual entry form in "Lookup Cert" tab
3. Staff views card on ALT and types details
4. Still saves to `alt_items` table
5. All other features work normally

**Pros:** No external dependencies, works immediately, no costs  
**Cons:** Labor intensive, defeats automation purpose, slower workflow

#### Recommended Approach

For most production use cases, **Option 1 (External Scraping API)** is recommended:
- Fastest time to production
- Reliable and maintained by experts
- Handles edge cases (CAPTCHAs, rate limiting)
- Cost is predictable and reasonable

The credentials you save in the Sessions tab will be used by whichever option you choose.

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

## Code Examples

### Example: Integrating ScrapingBee

Update `supabase/functions/card-show-fetch-alt/index.ts`:

```typescript
// After credentials check, call ScrapingBee
const scrapingBeeKey = Deno.env.get('SCRAPING_BEE_API_KEY');
const altUrl = `https://app.alt.xyz/cert/${certNumber}`;

const response = await fetch(
  `https://app.scrapingbee.com/api/v1/?api_key=${scrapingBeeKey}&url=${encodeURIComponent(altUrl)}&render_js=true`
);

const html = await response.text();
// Parse HTML to extract card details
// Save to alt_items table
```

### Example: Self-Hosted Playwright Server

Simple Express server with Playwright:

```javascript
const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const { certNumber, email, password } = req.body;
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Login to ALT
  await page.goto('https://app.alt.xyz/login');
  await page.fill('[name="email"]', email);
  await page.fill('[name="password"]', password);
  await page.click('button[type="submit"]');
  
  // Navigate to cert
  await page.goto(`https://app.alt.xyz/cert/${certNumber}`);
  const data = await page.evaluate(() => {
    // Extract card data from page
    return { title: '...', grade: '...', /* etc */ };
  });
  
  await browser.close();
  res.json(data);
});

app.listen(3000);
```

## Future Enhancements

- [ ] Bulk card import from CSV
- [ ] Advanced filtering (date ranges, price ranges)
- [ ] Show profit/loss reports
- [ ] Email notifications for high-value cards
- [ ] Mobile app integration
- [ ] Automated price tracking and alerts

## Support

For issues or feature requests, contact your system administrator or development team.

---

**Version**: 1.0  
**Last Updated**: 2025-01-06
