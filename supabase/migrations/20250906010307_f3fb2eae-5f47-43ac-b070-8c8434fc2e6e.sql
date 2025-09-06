-- Add missing created_by column to intake_items table
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Update existing rows to have created_by set (for data consistency)
UPDATE public.intake_items 
SET created_by = (
  SELECT id FROM auth.users 
  WHERE email = 'dorian@alohacardshop.com' -- fallback to a known user
  LIMIT 1
)
WHERE created_by IS NULL;