-- Enable Realtime for uploaders table
-- This allows the TV view to receive live updates when guests join the party

ALTER TABLE uploaders REPLICA IDENTITY FULL;

-- Add the uploaders table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE uploaders;
