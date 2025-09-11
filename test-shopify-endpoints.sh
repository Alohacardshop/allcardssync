#!/bin/bash

# Quick test script for Shopify endpoints
# Run after build to verify functionality

set -e

SUPABASE_URL="https://dmpoandoydaqxhzdjnmk.supabase.co"
SKU="TEST-SLAB-0001"
STORE_KEY="hawaii"

echo "🧪 Testing Shopify endpoints with SKU: $SKU"

echo "1. Creating & syncing..."
curl -s -X POST "$SUPABASE_URL/functions/v1/shopify-sync-inventory" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\",\"validateOnly\":true}" | jq

curl -s -X POST "$SUPABASE_URL/functions/v1/shopify-sync-inventory" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\"}" | jq

echo "2. Inspecting..."
curl -s -X POST "$SUPABASE_URL/functions/v1/shopify-inspect-sku" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\"}" | jq

echo "3. Testing removal functions..."
echo "  Testing graded removal:"
curl -s -X POST "$SUPABASE_URL/functions/v1/v2-shopify-remove-graded" \
  -H "Content-Type: application/json" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\"}" | jq

echo "  Testing raw removal:"
curl -s -X POST "$SUPABASE_URL/functions/v1/v2-shopify-remove-raw" \
  -H "Content-Type: application/json" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\"}" | jq

echo "4. Re-syncing (should recreate cleanly)..."
curl -s -X POST "$SUPABASE_URL/functions/v1/shopify-sync-inventory" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d "{\"storeKey\":\"$STORE_KEY\",\"sku\":\"$SKU\"}" | jq

echo "✅ Test completed!"