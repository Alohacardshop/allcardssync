
-- 1) Deduplicate printer_settings keeping the most recent per workstation_id
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY workstation_id
      ORDER BY COALESCE(updated_at, created_at) DESC
    ) AS rn
  FROM public.printer_settings
)
DELETE FROM public.printer_settings p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Enforce uniqueness on workstation_id so future duplicates cannot occur
-- Use a unique index (idempotent with IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS printer_settings_workstation_id_unique
  ON public.printer_settings (workstation_id);

-- 3) Ensure updated_at is refreshed on updates
DO $$
BEGIN
  CREATE TRIGGER set_timestamp_printer_settings
  BEFORE UPDATE ON public.printer_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION
  WHEN duplicate_object THEN
    -- trigger already exists, do nothing
    NULL;
END $$;
