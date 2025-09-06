#!/bin/bash

echo "Running E2E Tests to verify DB-only batch and Shopify sync..."

echo "Installing Playwright browsers if needed..."
npx playwright install

echo "Running intake batch tests (should show 0 function calls)..."
npx playwright test tests/intake_add_to_batch.spec.ts --reporter=line

echo "Running inventory sync tests (should show exactly 1+ function calls)..."
npx playwright test tests/inventory_send_to_shopify.spec.ts --reporter=line

echo "All tests completed! Check the output above for results."