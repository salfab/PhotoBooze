-- Fix RLS policy for photo inserts (supersedes 20241223000001)
-- The previous migration was marked as applied but policy wasn't created

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "Allow photo inserts from clients" ON photos;

-- Create the insert policy to allow client-side inserts
-- Security is enforced by signed upload URLs with 5min expiry
CREATE POLICY "Allow photo inserts from clients"
ON photos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
