UPDATE region_settings 
SET setting_value = jsonb_build_object('start', 8, 'end', 19, 'timezone', 'Pacific/Honolulu'),
    updated_at = now()
WHERE region_id = 'hawaii' AND setting_key = 'operations.business_hours';

UPDATE region_settings 
SET setting_value = jsonb_build_object('start', 8, 'end', 19, 'timezone', 'America/Los_Angeles'),
    updated_at = now()
WHERE region_id = 'las_vegas' AND setting_key = 'operations.business_hours';