-- Swap front and back images for all comics (they were reversed)
UPDATE public.intake_items
SET
  front_image_url = back_image_url,
  back_image_url = front_image_url,
  image_urls = jsonb_build_array(image_urls->>1, image_urls->>0),
  updated_at = now()
WHERE
  main_category = 'comics'
  AND deleted_at IS NULL
  AND front_image_url IS NOT NULL
  AND back_image_url IS NOT NULL
  AND jsonb_array_length(COALESCE(image_urls, '[]'::jsonb)) = 2;