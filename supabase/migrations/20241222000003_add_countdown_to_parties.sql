-- Add countdown_target field to parties table
ALTER TABLE parties
ADD COLUMN countdown_target TIMESTAMPTZ DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN parties.countdown_target IS 'Target date and time for countdown (typically midnight for New Year parties)';
