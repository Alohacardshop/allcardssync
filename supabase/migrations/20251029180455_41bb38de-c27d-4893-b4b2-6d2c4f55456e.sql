-- Fix the search_path security issue for the snapshot function
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;