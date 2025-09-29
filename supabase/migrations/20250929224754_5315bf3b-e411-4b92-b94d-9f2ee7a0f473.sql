-- Security Fix: Harden SECURITY DEFINER functions with immutable search_path
-- This prevents search_path injection attacks

-- Fix: update_lot_totals function (add SET search_path)
CREATE OR REPLACE FUNCTION public.update_lot_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_items integer;
  v_total_value numeric;
BEGIN
  SELECT 
    COUNT(*),
    COALESCE(SUM(price * quantity), 0)
  INTO v_total_items, v_total_value
  FROM public.intake_items
  WHERE lot_id = COALESCE(NEW.lot_id, OLD.lot_id)
    AND deleted_at IS NULL
    AND removed_from_batch_at IS NULL;

  UPDATE public.intake_lots
  SET 
    total_items = v_total_items,
    total_value = v_total_value,
    updated_at = now()
  WHERE id = COALESCE(NEW.lot_id, OLD.lot_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Fix: has_role function (add SET search_path)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$function$;

-- Drop and recreate normalize_game_slug to fix parameter name
DROP FUNCTION IF EXISTS public.normalize_game_slug(text);

CREATE FUNCTION public.normalize_game_slug(slug_in text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT lower(regexp_replace(slug_in, '[^a-zA-Z0-9]+', '-', 'g'));
$function$;

-- Add search_path to generate_lot_number if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'generate_lot_number' 
    AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.generate_lot_number()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO ''public''
      AS $inner$
      DECLARE
        new_number text;
      BEGIN
        new_number := ''LOT-'' || to_char(now(), ''YYYYMMDD'') || ''-'' || 
                      lpad(nextval(''lot_number_seq'')::text, 6, ''0'');
        RETURN new_number;
      END;
      $inner$;
    ';
  END IF;
END $$;

COMMENT ON FUNCTION public.update_lot_totals() IS 'Trigger function with hardened search_path for security';
COMMENT ON FUNCTION public.has_role(uuid, app_role) IS 'RLS helper with immutable search_path';
COMMENT ON FUNCTION public.normalize_game_slug(text) IS 'Game slug normalizer with immutable search_path';