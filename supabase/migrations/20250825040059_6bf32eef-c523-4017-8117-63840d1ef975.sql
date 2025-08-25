
-- Migrate legacy Hawaii keys to standardized per-store keys if empty/missing
-- Store Domain
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify store domain for Hawaii Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_STORE_DOMAIN_HAWAII'
  AND t.key_name = 'SHOPIFY_HAWAII_STORE_DOMAIN'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_HAWAII_STORE_DOMAIN', s.key_value, 'Shopify store domain for Hawaii Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_STORE_DOMAIN_HAWAII'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_HAWAII_STORE_DOMAIN');

-- Admin Access Token
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify Admin API access token for Hawaii Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_ADMIN_ACCESS_TOKEN_HAWAII'
  AND t.key_name = 'SHOPIFY_HAWAII_ACCESS_TOKEN'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_HAWAII_ACCESS_TOKEN', s.key_value, 'Shopify Admin API access token for Hawaii Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_ADMIN_ACCESS_TOKEN_HAWAII'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_HAWAII_ACCESS_TOKEN');

-- API Key
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify API Key for Hawaii Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_KEY_HAWAII'
  AND t.key_name = 'SHOPIFY_HAWAII_API_KEY'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_HAWAII_API_KEY', s.key_value, 'Shopify API Key for Hawaii Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_KEY_HAWAII'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_HAWAII_API_KEY');

-- API Secret
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify API Secret for Hawaii Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_SECRET_HAWAII'
  AND t.key_name = 'SHOPIFY_HAWAII_API_SECRET'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_HAWAII_API_SECRET', s.key_value, 'Shopify API Secret for Hawaii Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_SECRET_HAWAII'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_HAWAII_API_SECRET');

-- Webhook Secret
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify Webhook Secret for Hawaii Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_WEBHOOK_SECRET_HAWAII'
  AND t.key_name = 'SHOPIFY_HAWAII_WEBHOOK_SECRET'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_HAWAII_WEBHOOK_SECRET', s.key_value, 'Shopify Webhook Secret for Hawaii Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_WEBHOOK_SECRET_HAWAII'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_HAWAII_WEBHOOK_SECRET');

-- Migrate legacy Las Vegas keys to standardized per-store keys if empty/missing
-- Store Domain
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify store domain for Las Vegas Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_STORE_DOMAIN_LASVEGAS'
  AND t.key_name = 'SHOPIFY_LAS_VEGAS_STORE_DOMAIN'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_LAS_VEGAS_STORE_DOMAIN', s.key_value, 'Shopify store domain for Las Vegas Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_STORE_DOMAIN_LASVEGAS'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_LAS_VEGAS_STORE_DOMAIN');

-- Admin Access Token (if legacy key exists)
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify Admin API access token for Las Vegas Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_ADMIN_ACCESS_TOKEN_LASVEGAS'
  AND t.key_name = 'SHOPIFY_LAS_VEGAS_ACCESS_TOKEN'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_LAS_VEGAS_ACCESS_TOKEN', s.key_value, 'Shopify Admin API access token for Las Vegas Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_ADMIN_ACCESS_TOKEN_LASVEGAS'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_LAS_VEGAS_ACCESS_TOKEN');

-- API Key (if legacy key exists)
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify API Key for Las Vegas Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_KEY_LASVEGAS'
  AND t.key_name = 'SHOPIFY_LAS_VEGAS_API_KEY'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_LAS_VEGAS_API_KEY', s.key_value, 'Shopify API Key for Las Vegas Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_KEY_LASVEGAS'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_LAS_VEGAS_API_KEY');

-- API Secret (if legacy key exists)
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify API Secret for Las Vegas Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_SECRET_LASVEGAS'
  AND t.key_name = 'SHOPIFY_LAS_VEGAS_API_SECRET'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_LAS_VEGAS_API_SECRET', s.key_value, 'Shopify API Secret for Las Vegas Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_API_SECRET_LASVEGAS'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_LAS_VEGAS_API_SECRET');

-- Webhook Secret (if legacy key exists)
UPDATE system_settings t
SET key_value = s.key_value, description = 'Shopify Webhook Secret for Las Vegas Store', category = 'shopify', is_encrypted = true, updated_at = now()
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_WEBHOOK_SECRET_LASVEGAS'
  AND t.key_name = 'SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET'
  AND (t.key_value IS NULL OR t.key_value = '');

INSERT INTO system_settings (key_name, key_value, description, is_encrypted, category)
SELECT 'SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET', s.key_value, 'Shopify Webhook Secret for Las Vegas Store', true, 'shopify'
FROM system_settings s
WHERE s.key_name = 'SHOPIFY_WEBHOOK_SECRET_LASVEGAS'
  AND NOT EXISTS (SELECT 1 FROM system_settings t WHERE t.key_name = 'SHOPIFY_LAS_VEGAS_WEBHOOK_SECRET');
