-- Add explicit front/back image columns to intake_items
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS front_image_url text,
ADD COLUMN IF NOT EXISTS back_image_url text;

COMMENT ON COLUMN public.intake_items.front_image_url IS 'Explicit front/cover image URL. For comics, backfilled from image_urls[0]. For cards, set from PSA IsFrontImage.';
COMMENT ON COLUMN public.intake_items.back_image_url IS 'Explicit back image URL. For comics, backfilled from image_urls[1].';

-- Backfill existing comic rows from image_urls array
UPDATE public.intake_items
SET
  front_image_url = image_urls->>0,
  back_image_url = image_urls->>1
WHERE
  main_category = 'comics'
  AND image_urls IS NOT NULL
  AND front_image_url IS NULL;

-- Create audit helper function for comic image coverage
CREATE OR REPLACE FUNCTION public.audit_comic_image_coverage()
RETURNS TABLE(
  total_comics bigint,
  with_both_images bigint,
  with_front_only bigint,
  with_back_only bigint,
  missing_both bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total_comics,
    count(*) FILTER (WHERE front_image_url IS NOT NULL AND back_image_url IS NOT NULL)::bigint AS with_both_images,
    count(*) FILTER (WHERE front_image_url IS NOT NULL AND back_image_url IS NULL)::bigint AS with_front_only,
    count(*) FILTER (WHERE front_image_url IS NULL AND back_image_url IS NOT NULL)::bigint AS with_back_only,
    count(*) FILTER (WHERE front_image_url IS NULL AND back_image_url IS NULL)::bigint AS missing_both
  FROM public.intake_items
  WHERE main_category = 'comics'
    AND deleted_at IS NULL;
$$;