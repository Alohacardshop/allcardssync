-- Add eBay listing templates for graded comics (PSA and CGC) for both stores

INSERT INTO ebay_listing_templates (
  store_key,
  name,
  category_id,
  category_name,
  condition_id,
  is_graded,
  default_grader,
  is_active,
  is_default,
  title_template,
  description_template,
  aspects_mapping
) VALUES 
-- Hawaii PSA Comics
(
  'hawaii',
  'Graded Comic (PSA)',
  '63',
  'Collectible Comic Books',
  '3000',
  true,
  'PSA',
  true,
  false,
  '{{subject}} #{{card_number}} {{year}} {{brand_title}} PSA {{grade}}',
  '<p>PSA Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> PSA {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>',
  '{"Publisher": "{{brand_title}}", "Year": "{{year}}", "Issue Number": "{{card_number}}", "Graded": "Yes", "Professional Grader": "PSA", "Grade": "{{grade}}", "Certification Number": "{{sku}}"}'::jsonb
),
-- Hawaii CGC Comics
(
  'hawaii',
  'Graded Comic (CGC)',
  '63',
  'Collectible Comic Books',
  '3000',
  true,
  'CGC',
  true,
  false,
  '{{subject}} #{{card_number}} {{year}} {{brand_title}} CGC {{grade}}',
  '<p>CGC Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> CGC {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>',
  '{"Publisher": "{{brand_title}}", "Year": "{{year}}", "Issue Number": "{{card_number}}", "Graded": "Yes", "Professional Grader": "CGC", "Grade": "{{grade}}", "Certification Number": "{{sku}}"}'::jsonb
),
-- Las Vegas PSA Comics
(
  'las_vegas',
  'Graded Comic (PSA)',
  '63',
  'Collectible Comic Books',
  '3000',
  true,
  'PSA',
  true,
  false,
  '{{subject}} #{{card_number}} {{year}} {{brand_title}} PSA {{grade}}',
  '<p>PSA Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> PSA {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>',
  '{"Publisher": "{{brand_title}}", "Year": "{{year}}", "Issue Number": "{{card_number}}", "Graded": "Yes", "Professional Grader": "PSA", "Grade": "{{grade}}", "Certification Number": "{{sku}}"}'::jsonb
),
-- Las Vegas CGC Comics
(
  'las_vegas',
  'Graded Comic (CGC)',
  '63',
  'Collectible Comic Books',
  '3000',
  true,
  'CGC',
  true,
  false,
  '{{subject}} #{{card_number}} {{year}} {{brand_title}} CGC {{grade}}',
  '<p>CGC Graded Comic Book</p><p><b>Title:</b> {{subject}}</p><p><b>Issue:</b> #{{card_number}}</p><p><b>Publisher:</b> {{brand_title}}</p><p><b>Year:</b> {{year}}</p><p><b>Grade:</b> CGC {{grade}}</p><p><b>Cert #:</b> {{sku}}</p>',
  '{"Publisher": "{{brand_title}}", "Year": "{{year}}", "Issue Number": "{{card_number}}", "Graded": "Yes", "Professional Grader": "CGC", "Grade": "{{grade}}", "Certification Number": "{{sku}}"}'::jsonb
);