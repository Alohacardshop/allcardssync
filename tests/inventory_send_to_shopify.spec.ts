import { test, expect } from '@playwright/test';

test.describe('Inventory Send to Shopify - Single Function Call', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication as staff user
    await page.goto('/');
    
    await page.addInitScript(() => {
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

    // Mock auth responses
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

    // Mock has_role - user is staff
    await page.route('**/rest/v1/rpc/has_role', async route => {
      const body = await route.request().postDataJSON();
      const isStaffCheck = body._role === 'staff';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(isStaffCheck)
      });
    });

    // Mock store and assignment data
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
  });

  test('Send to Inventory triggers exactly one Shopify sync call', async ({ page }) => {
    const shopifySyncCalls: string[] = [];
    const allFunctionCalls: string[] = [];

    // Track all function calls, specifically Shopify sync
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/functions/v1/')) {
        allFunctionCalls.push(url);
        if (url.includes('/functions/v1/shopify-sync-inventory')) {
          shopifySyncCalls.push(url);
        }
      }
    });

    // Mock batch with items
    await page.route('**/rest/v1/intake_lots*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-lot-id',
            lot_number: 'LOT-000001',
            total_items: 1,
            total_value: 100,
            status: 'active'
          }
        ])
      });
    });

    // Mock batch items
    await page.route('**/rest/v1/intake_items*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-item-id',
            lot_number: 'LOT-000001',
            brand_title: 'Test Card',
            subject: 'Test Subject',
            price: 100,
            quantity: 1,
            sku: 'TEST-SKU-001',
            store_key: 'test_store',
            shopify_location_gid: 'gid://shopify/Location/123',
            removed_from_batch_at: null
          }
        ])
      });
    });

    // Mock the "send to inventory" RPC call
    await page.route('**/rest/v1/rpc/send_intake_item_to_inventory', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-item-id',
          removed_from_batch_at: new Date().toISOString()
        })
      });
    });

    // Mock the Shopify sync function call
    await page.route('**/functions/v1/shopify-sync-inventory', async route => {
      const requestBody = await route.request().postDataJSON();
      
      // Verify the expected body structure
      expect(requestBody).toEqual({
        storeKey: 'test_store',
        sku: 'TEST-SKU-001',
        locationGid: 'gid://shopify/Location/123'
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    // Navigate to batches page
    await page.goto('/batches');
    await page.waitForLoadState('networkidle');

    // Wait for batch data to load
    await expect(page.getByText('LOT-000001')).toBeVisible();

    // Click on the batch to expand/view items
    await page.click('text=LOT-000001');
    
    // Look for the "Send to Inventory" button and click it
    // This might be in a dropdown or directly visible
    const sendButton = page.getByText('Send to Inventory').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      // If it's in a dropdown, look for action menu
      const actionButton = page.getByRole('button', { name: /actions|menu/i }).first();
      if (await actionButton.isVisible()) {
        await actionButton.click();
        await page.getByText('Send to Inventory').click();
      }
    }

    // Wait for the operation to complete
    await page.waitForTimeout(2000);

    // Verify exactly one Shopify sync call was made
    expect(shopifySyncCalls).toHaveLength(1);
    expect(shopifySyncCalls[0]).toContain('shopify-sync-inventory');

    // Verify the call was made with correct parameters
    // (this is already verified in the route mock above)

    // Verify success indication
    await expect(page.getByText(/sent to inventory|moved to inventory/i)).toBeVisible();
  });

  test('Bulk send to inventory triggers multiple Shopify sync calls', async ({ page }) => {
    const shopifySyncCalls: string[] = [];

    page.on('request', request => {
      const url = request.url();
      if (url.includes('/functions/v1/shopify-sync-inventory')) {
        shopifySyncCalls.push(url);
      }
    });

    // Mock batch with multiple items
    await page.route('**/rest/v1/intake_lots*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-lot-id',
            lot_number: 'LOT-000002',
            total_items: 2,
            total_value: 200,
            status: 'active'
          }
        ])
      });
    });

    await page.route('**/rest/v1/intake_items*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'test-item-1',
            lot_number: 'LOT-000002',
            brand_title: 'Test Card 1',
            sku: 'TEST-SKU-001',
            store_key: 'test_store',
            shopify_location_gid: 'gid://shopify/Location/123'
          },
          {
            id: 'test-item-2',
            lot_number: 'LOT-000002', 
            brand_title: 'Test Card 2',
            sku: 'TEST-SKU-002',
            store_key: 'test_store',
            shopify_location_gid: 'gid://shopify/Location/123'
          }
        ])
      });
    });

    // Mock bulk send RPC
    await page.route('**/rest/v1/rpc/send_batch_to_inventory', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ processed_count: 2 })
      });
    });

    // Mock Shopify sync calls
    await page.route('**/functions/v1/shopify-sync-inventory', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/batches');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('LOT-000002')).toBeVisible();

    // Click bulk send action
    const bulkSendButton = page.getByText('Send All to Inventory').first();
    if (await bulkSendButton.isVisible()) {
      await bulkSendButton.click();
    }

    await page.waitForTimeout(3000);

    // Verify multiple sync calls were made (one per item)
    expect(shopifySyncCalls.length).toBeGreaterThanOrEqual(2);
  });
});