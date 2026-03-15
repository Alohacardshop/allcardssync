-- RESTORE: Reset SKU 146094215 for re-test after bugfix
UPDATE cards SET status = 'available', updated_at = now() WHERE sku = '146094215';
UPDATE intake_items SET quantity = 1, sold_at = NULL, sold_channel = NULL, sold_order_id = NULL, sold_price = NULL, sold_currency = NULL, shopify_order_id = NULL, updated_by = 'test_reset' WHERE sku = '146094215';
DELETE FROM sales_events WHERE sku = '146094215';