-- Create PSA certificates table
CREATE TABLE IF NOT EXISTS psa_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cert_number VARCHAR(20) UNIQUE NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT false,
    
    -- PSA Certificate Data
    grade VARCHAR(50),
    year VARCHAR(10),
    brand VARCHAR(100),
    subject VARCHAR(200),
    card_number VARCHAR(20),
    category VARCHAR(100),
    variety_pedigree VARCHAR(200),
    
    -- Metadata
    psa_url TEXT,
    image_url TEXT,
    image_urls JSONB,
    scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Debug data
    raw_html TEXT,
    raw_markdown TEXT,
    firecrawl_response JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_psa_cert_number ON psa_certificates(cert_number);
CREATE INDEX IF NOT EXISTS idx_psa_scraped_at ON psa_certificates(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_psa_valid_certs ON psa_certificates(is_valid) WHERE is_valid = true;

-- Enable RLS
ALTER TABLE psa_certificates ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Staff can view PSA certificates" 
ON psa_certificates FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can insert PSA certificates" 
ON psa_certificates FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can update PSA certificates" 
ON psa_certificates FOR UPDATE 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add PSA columns to intake_items if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'intake_items' AND column_name = 'psa_cert_number') THEN
        ALTER TABLE intake_items ADD COLUMN psa_cert_number VARCHAR(20);
        CREATE INDEX IF NOT EXISTS idx_intake_psa_cert ON intake_items(psa_cert_number);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'intake_items' AND column_name = 'psa_verified') THEN
        ALTER TABLE intake_items ADD COLUMN psa_verified BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'intake_items' AND column_name = 'psa_last_check') THEN
        ALTER TABLE intake_items ADD COLUMN psa_last_check TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create rate limiting table for PSA requests
CREATE TABLE IF NOT EXISTS psa_request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address TEXT,
    cert_number VARCHAR(20),
    success BOOLEAN,
    response_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on request log
ALTER TABLE psa_request_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for request log (admin only)
CREATE POLICY "Admin can view PSA request logs" 
ON psa_request_log FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));