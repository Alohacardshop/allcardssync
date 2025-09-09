-- Temporarily drop the foreign key constraint  
ALTER TABLE item_snapshots DROP CONSTRAINT IF EXISTS item_snapshots_intake_item_id_fkey;

-- Delete item_snapshots for graded and raw cards first
DELETE FROM item_snapshots 
WHERE intake_item_id IN (
  SELECT id FROM intake_items 
  WHERE type IN ('Raw', 'Graded') 
  OR grading_company IS NOT NULL
);

-- Delete audit_log entries for graded and raw cards
DELETE FROM audit_log 
WHERE table_name = 'intake_items' 
AND record_id IN (
  SELECT id::text FROM intake_items 
  WHERE type IN ('Raw', 'Graded') 
  OR grading_company IS NOT NULL
);

-- Delete print_jobs for graded and raw cards
DELETE FROM print_jobs 
WHERE EXISTS (
  SELECT 1 FROM intake_items ii
  WHERE ii.lot_number = (print_jobs.data->>'lot_number')::text
  AND (ii.type IN ('Raw', 'Graded') OR ii.grading_company IS NOT NULL)
);

-- Delete the graded and raw cards from intake_items
DELETE FROM intake_items 
WHERE type IN ('Raw', 'Graded') 
OR grading_company IS NOT NULL;

-- Clean up empty lots
DELETE FROM intake_lots 
WHERE id NOT IN (SELECT DISTINCT lot_id FROM intake_items WHERE lot_id IS NOT NULL);

-- Recreate the foreign key constraint
ALTER TABLE item_snapshots 
ADD CONSTRAINT item_snapshots_intake_item_id_fkey 
FOREIGN KEY (intake_item_id) REFERENCES intake_items(id);

-- Log the cleanup  
INSERT INTO system_logs (message, level, source, metadata)
VALUES (
  'Manually deleted graded and raw cards from inventory',
  'info',
  'database_cleanup', 
  jsonb_build_object(
    'action', 'delete_graded_raw_cards',
    'timestamp', now()
  )
);