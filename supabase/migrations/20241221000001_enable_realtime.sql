-- Enable Realtime for photos table
-- This allows the TV view to receive live updates when photos are inserted

ALTER TABLE photos REPLICA IDENTITY FULL;

-- Add the photos table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE photos;
