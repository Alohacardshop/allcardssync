-- Update cert 146094215: has 2 images in psa_certificates cache
UPDATE public.intake_items
SET
  image_urls = '["https://d1htnxwo4o0jhw.cloudfront.net/cert/199262568/aUqBDKB97kG9I7fq4MKSZQ.jpg","https://d1htnxwo4o0jhw.cloudfront.net/cert/199262568/uooA2qS1wUGojEweOijfpw.jpg"]'::jsonb,
  front_image_url = 'https://d1htnxwo4o0jhw.cloudfront.net/cert/199262568/aUqBDKB97kG9I7fq4MKSZQ.jpg',
  back_image_url = 'https://d1htnxwo4o0jhw.cloudfront.net/cert/199262568/uooA2qS1wUGojEweOijfpw.jpg',
  updated_at = now()
WHERE id = '5d89030b-9a5e-42f6-aab8-bb0241c818c8';