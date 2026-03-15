INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES ('las_vegas', 'services.comics_enabled', 'false', 'Enable comic intake and comic-related features')
ON CONFLICT (region_id, setting_key) DO UPDATE SET setting_value = 'false', updated_at = now();