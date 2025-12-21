-- Add name column to parties table for human-friendly display names
ALTER TABLE parties ADD COLUMN name TEXT UNIQUE;

-- Create index for faster name lookups
CREATE INDEX idx_parties_name ON parties(name);
