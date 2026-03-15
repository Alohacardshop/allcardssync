-- Clean up test notifications for order #132951
DELETE FROM pending_notifications WHERE payload->>'id' = '7039699222703';