
-- Trigger to enforce quantity = 1 for graded items
CREATE OR REPLACE FUNCTION public.enforce_graded_quantity_one()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.grading_company IS NOT NULL AND NEW.grading_company != 'none' THEN
    NEW.quantity := 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER enforce_graded_quantity_one
  BEFORE INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_graded_quantity_one();
