-- Drop remaining old 19-arg overload (missing grading_company_in) to prevent PostgREST disambiguation
DROP FUNCTION IF EXISTS public.create_raw_intake_item(
  text, text, integer, text, text, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, text, text, text, text
);