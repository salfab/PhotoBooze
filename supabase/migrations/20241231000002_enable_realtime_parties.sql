-- Enable Realtime for parties table
-- This allows TV displays to receive live updates when party settings change (background, countdown, etc.)

ALTER TABLE parties REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
