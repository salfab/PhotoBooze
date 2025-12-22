-- Add admin PIN protection to parties
ALTER TABLE parties ADD COLUMN admin_pin_hash TEXT;

-- Add index for faster lookups
CREATE INDEX idx_parties_admin_pin_hash ON parties(admin_pin_hash) WHERE admin_pin_hash IS NOT NULL;
