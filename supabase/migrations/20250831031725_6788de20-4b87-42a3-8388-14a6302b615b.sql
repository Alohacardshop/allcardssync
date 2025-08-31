-- Clear cached PSA certificate data to ensure fresh scraping
DELETE FROM psa_certificates WHERE cert_number = '120317196';