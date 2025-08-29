-- Remove duplicate Las Vegas store entry
DELETE FROM shopify_stores 
WHERE key = 'lasvegas' AND vendor = 'Las Vegas';