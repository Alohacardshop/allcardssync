#!/usr/bin/env tsx
/**
 * Data sanity script - Scan for duplicate entries
 * Exit code 1 if duplicates found (useful for CI)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dmpoandoydaqxhzdjnmk.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function scanDuplicates() {
  console.log('🔍 Scanning for duplicate entries...\n');

  let hasErrors = false;

  // Check 1: Duplicate shopify_product_id
  const { data: shopifyDupes, error: shopifyError } = await supabase.rpc(
    'check_shopify_product_id_dupes' as any
  );

  if (shopifyError) {
    console.error('❌ Failed to check Shopify product ID duplicates:', shopifyError.message);
    process.exit(2);
  }

  const shopifyDupeCount = (shopifyDupes as any[])?.length || 0;
  if (shopifyDupeCount > 0) {
    console.log(`❌ Found ${shopifyDupeCount} items with duplicate shopify_product_id`);
    hasErrors = true;
  } else {
    console.log('✅ No duplicate shopify_product_id entries');
  }

  // Check 2: Duplicate (store_key, sku) for Raw items
  const { data: skuDupes, error: skuError } = await supabase.rpc(
    'check_sku_dupes' as any
  );

  if (skuError) {
    console.error('❌ Failed to check SKU duplicates:', skuError.message);
    process.exit(2);
  }

  const skuDupeCount = (skuDupes as any[])?.length || 0;
  if (skuDupeCount > 0) {
    console.log(`❌ Found ${skuDupeCount} Raw items with duplicate (store_key, sku)`);
    hasErrors = true;
  } else {
    console.log('✅ No duplicate SKU entries for Raw items');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (hasErrors) {
    console.log(`❌ FAILED: Found ${shopifyDupeCount + skuDupeCount} total duplicate entries`);
    console.log('Run duplicate cleanup tools in Admin → System → Maintenance');
    process.exit(1);
  } else {
    console.log('✅ PASSED: No duplicates found - database is clean');
    process.exit(0);
  }
}

scanDuplicates().catch((err) => {
  console.error('💥 Unexpected error:', err);
  process.exit(2);
});
