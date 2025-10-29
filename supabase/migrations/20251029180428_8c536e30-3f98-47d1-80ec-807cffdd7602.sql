-- Drop all triggers that depend on the function
DROP TRIGGER IF EXISTS snapshot_intake_items ON intake_items;
DROP TRIGGER IF EXISTS intake_item_snapshot_trigger ON intake_items;

-- Now we can drop the function
DROP FUNCTION IF EXISTS create_intake_item_snapshot();

-- Recreate the function with the current schema (including updated_by column)
CREATE OR REPLACE FUNCTION create_intake_item_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO item_snapshots (
    intake_item_id,
    snapshot_type,
    snapshot_data,
    created_by,
    metadata
  )
  VALUES (
    NEW.id,
    TG_OP::text,
    to_jsonb(NEW),
    NEW.created_by,
    jsonb_build_object(
      'trigger_time', NOW(),
      'operation', TG_OP
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER snapshot_intake_items
  AFTER INSERT OR UPDATE ON intake_items
  FOR EACH ROW
  EXECUTE FUNCTION create_intake_item_snapshot();