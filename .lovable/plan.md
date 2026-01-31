
# Add Discord Configuration to Region Settings Admin UI

## Problem
The Region Settings page in Admin (`/admin` → "Region Settings" in sidebar) exists but is missing the Discord configuration fields. The backend is ready to use these settings, but admins have no way to enter the webhook URLs.

## Solution
Add a new **"Discord Notifications"** accordion section to the `RegionSettingsEditor` component with fields for:
- `discord.webhook_url` - The Discord webhook URL (password/sensitive field)
- `discord.role_id` - Staff role ID for @mentions  
- `discord.enabled` - Toggle to enable/disable notifications

## Technical Changes

### File: `src/components/admin/RegionSettingsEditor.tsx`

1. **Add MessageSquare icon import** (line ~24):
   ```tsx
   import { MessageSquare } from 'lucide-react';
   ```

2. **Add Discord settings to SETTING_FIELDS array** (after line 53):
   ```tsx
   // Discord
   { key: 'discord.webhook_url', label: 'Discord Webhook URL', type: 'password', category: 'discord', description: 'Webhook URL for sending order notifications' },
   { key: 'discord.role_id', label: 'Staff Role ID', type: 'text', category: 'discord', description: 'Discord role ID to mention for new orders (optional)' },
   { key: 'discord.enabled', label: 'Notifications Enabled', type: 'boolean', category: 'discord', description: 'Enable Discord notifications for this region' },
   ```

3. **Update SettingField interface** to support 'password' type and 'discord' category:
   ```tsx
   interface SettingField {
     key: string;
     label: string;
     type: 'text' | 'number' | 'boolean' | 'color' | 'json' | 'password';
     description?: string;
     category: 'branding' | 'ebay' | 'operations' | 'discord';
   }
   ```

4. **Add password field renderer** in `renderField` function:
   - Similar to text field but with `type="password"` 
   - Add a show/hide toggle button for visibility

5. **Add Discord accordion section** after the Operations accordion (around line 383):
   ```tsx
   <AccordionItem value="discord">
     <AccordionTrigger className="hover:no-underline">
       <div className="flex items-center gap-2">
         <MessageSquare className="h-4 w-4" />
         Discord Notifications
       </div>
     </AccordionTrigger>
     <AccordionContent className="space-y-4 pt-4">
       {SETTING_FIELDS.filter(f => f.category === 'discord').map((field) => (
         <div key={field.key}>
           {renderField(field, region.id)}
         </div>
       ))}
     </AccordionContent>
   </AccordionItem>
   ```

6. **Add 'discord' to defaultValue array** for accordion to be expanded by default:
   ```tsx
   <Accordion type="multiple" defaultValue={['branding', 'ebay', 'operations', 'discord']}>
   ```

## Result After Implementation

When you go to **Admin → Region Settings**:
1. Select **Hawaii** or **Las Vegas** tab
2. Expand the new **"Discord Notifications"** section
3. Enter your Discord webhook URL
4. Optionally enter the staff Role ID for @mentions
5. Toggle "Notifications Enabled" to ON
6. Click Save on each field

## Getting Your Discord Webhook URL

1. Open Discord and go to the channel where you want notifications
2. Click the gear icon (Edit Channel) → Integrations → Webhooks
3. Click "New Webhook" or select an existing one
4. Click "Copy Webhook URL"
5. Paste it into the Region Settings page

## Getting Your Discord Role ID

1. In Discord, go to Server Settings → Roles
2. Right-click the role you want to mention → Copy ID
   - (You must have Developer Mode enabled: User Settings → Advanced → Developer Mode)
3. Paste the numeric ID into the "Staff Role ID" field
