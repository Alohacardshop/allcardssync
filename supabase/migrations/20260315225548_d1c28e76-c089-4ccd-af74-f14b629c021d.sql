-- CLEANUP: Restore SKU 146094215 after successful test
UPDATE cards SET status = 'available', updated_at = now() WHERE sku = '146094215';
UPDATE intake_items SET quantity = 1, sold_at = NULL, sold_channel = NULL, sold_order_id = NULL, sold_price = NULL, sold_currency = NULL, shopify_order_id = NULL, updated_by = 'test_cleanup' WHERE sku = '146094215';
DELETE FROM sales_events WHERE source_event_id = 'TEST-EBAY-ORDER-002_146094215';