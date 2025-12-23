-- Enable RLS on photos table (should already be enabled, but ensure it)
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert photos (validation happens via signed URLs and party status)
-- Note: Since we don't use Supabase Auth, we can't restrict by auth.uid()
-- Security is enforced by:
-- 1. Signed upload URLs (5 min expiry) from prepare-upload endpoint
-- 2. Server-side validation that party is active before issuing URLs
-- 3. Session validation before issuing URLs
CREATE POLICY "Allow photo inserts from clients"
ON photos
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Keep existing select policy (should be public for TV display)
-- If no select policy exists, create one
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'photos' AND policyname = 'Allow public photo reads'
  ) THEN
    CREATE POLICY "Allow public photo reads"
    ON photos
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;
