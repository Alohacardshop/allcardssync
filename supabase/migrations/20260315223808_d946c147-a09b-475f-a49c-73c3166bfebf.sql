-- Revert test sale for SKU 146094215
UPDATE intake_items SET quantity = 1, sold_at = NULL, sold_channel = NULL, sold_order_id = NULL, sold_price = NULL, sold_currency = NULL, updated_by = 'test_revert' WHERE sku = '146094215' AND sold_order_id = 'TEST-ORDER-2026-0315';

UPDATE cards SET status = 'available', updated_at = now() WHERE sku = '146094215' AND status = 'sold';

DELETE FROM sales_events WHERE source_event_id = 'TEST-ORDER-2026-0315_146094215';