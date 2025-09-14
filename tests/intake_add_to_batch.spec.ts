import { test, expect } from '@playwright/test';

test.describe('Intake Add to Batch - DB Only', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication as staff user with store/location access
    await page.goto('/');
    
    // Mock Supabase auth session
    await page.addInitScript(() => {
      // Mock localStorage auth data
      localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_at: Date.now() + 3600000,
        user: {
          id: '7fe7e262-6c4e-4b23-9b60-624ff29c1749',
          email: 'test@staff.com',
          role: 'authenticated'
        }
      }));
    });

    // Mock API responses for auth and permissions
    await page.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '7fe7e262-6c4e-4b23-9b60-624ff29c1749',
          email: 'test@staff.com',
          role: 'authenticated'
        })
      });
    });

    // Mock has_role RPC calls
    await page.route('**/rest/v1/rpc/has_role', async route => {
      const body = await route.request().postDataJSON();
      const isStaffCheck = body._role === 'staff';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isStaffCheck)
      });
    });

    // Mock store and location data
    await page.route('**/rest/v1/shopify_stores*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { key: 'test_store', name: 'Test Store', vendor: 'Test Vendor' }
        ])
      });
    });

    await page.route('**/rest/v1/user_shopify_assignments*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            store_key: 'test_store',
            location_gid: 'gid://shopify/Location/123',
            location_name: 'Test Location',
            is_default: true
          }
        ])
      });
    });

    // Mock debug_eval_intake_access RPC
    await page.route('**/rest/v1/rpc/debug_eval_intake_access', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: '7fe7e262-6c4e-4b23-9b60-624ff29c1749',
          store_key: 'test_store',
          location_gid: 'gid://shopify/Location/123',
          has_staff: true,
          can_access_location: true
        })
      });
    });
  });

  test('Add to Batch makes only RPC call, no function calls', async ({ page }) => {
    const rpcCalls: string[] = [];
    const functionCalls: string[] = [];

    // Track RPC calls
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/rest/v1/rpc/create_raw_intake_item')) {
        rpcCalls.push(url);
      }
      if (url.includes('/functions/v1/')) {
        functionCalls.push(url);
      }
    });

    // Mock successful RPC response
    await page.route('**/rest/v1/rpc/create_raw_intake_item', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-item-id',
          lot_number: 'LOT-000001',
          created_at: new Date().toISOString()
        })
      });
    });

    // Mock other necessary API calls
    await page.route('**/rest/v1/intake_lots*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/rest/v1/intake_items*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/rest/v1/label_templates*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Navigate to the graded card intake
    await page.goto('/');
    await page.getByText('Graded Cards Intake').first().click();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Fill in PSA certificate (mock data)
    await page.fill('input[placeholder="Enter PSA certificate number"]', '12345678');
    
    // Mock PSA fetch response - now returns error since scraper was removed
    await page.route('**/functions/v1/psa-scrape-v2', async route => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'PSA scraper functionality removed - please implement direct API integration'
        })
      });
    });

    // Click fetch PSA button
    await page.click('button:has-text("Fetch PSA Data")');
    await page.waitForTimeout(1000);

    // Fill required fields
    await page.fill('input[placeholder="Enter price"]', '100');
    await page.fill('input[placeholder="Enter cost"]', '50');

    // Clear tracking arrays before the action
    rpcCalls.length = 0;
    functionCalls.length = 0;

    // Click Add to Batch
    await page.click('button:has-text("Add to Batch")');

    // Wait for the operation to complete
    await page.waitForTimeout(2000);

    // Verify exactly one RPC call was made
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toContain('create_raw_intake_item');

    // Verify NO function calls were made
    expect(functionCalls).toHaveLength(0);

    // Verify success toast appears
    await expect(page.getByText('Added to batch')).toBeVisible();
  });
});