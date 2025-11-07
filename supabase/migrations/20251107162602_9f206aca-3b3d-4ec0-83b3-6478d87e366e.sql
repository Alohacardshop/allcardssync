-- Add status field to alt_items to track card state within show ecosystem
ALTER TABLE alt_items 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'available' CHECK (status IN ('available', 'in_show_inventory', 'sold'));

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_alt_items_status ON alt_items(status);

-- Add updated_at trigger if not exists
CREATE OR REPLACE FUNCTION update_alt_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_alt_items_timestamp ON alt_items;
CREATE TRIGGER update_alt_items_timestamp
BEFORE UPDATE ON alt_items
FOR EACH ROW
EXECUTE FUNCTION update_alt_items_updated_at();