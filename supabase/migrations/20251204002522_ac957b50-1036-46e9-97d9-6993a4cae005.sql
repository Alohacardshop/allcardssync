-- Add field_mappings column to print_profiles for mapping Shopify fields to label fields
ALTER TABLE public.print_profiles 
ADD COLUMN IF NOT EXISTS field_mappings jsonb DEFAULT '{
  "title": {"source": "brand_title"},
  "sku": {"source": "sku"},
  "price": {"source": "price", "format": "currency"},
  "condition": {"source": "grade", "abbreviate": true},
  "barcode": {"source": "sku"},
  "set": {"source": "subject"},
  "cardNumber": {"source": "card_number"},
  "year": {"source": "year"},
  "vendor": {"source": "vendor"}
}'::jsonb;