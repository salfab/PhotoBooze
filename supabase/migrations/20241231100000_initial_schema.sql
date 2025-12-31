-- PhotoBooze Complete Initial Schema
-- Consolidated migration - all tables, indexes, policies, and configuration

-- ============================================================================
-- TABLES
-- ============================================================================

-- Parties table
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    closed_at TIMESTAMPTZ,
    countdown_target TIMESTAMPTZ DEFAULT NULL,
    admin_pin_hash TEXT,
    background TEXT DEFAULT 'new-years-eve.jpg' CHECK (background IN ('art-deco.jpg', 'berlin.jpg', 'cossonay.jpg', 'new-years-eve.jpg'))
);

COMMENT ON COLUMN parties.countdown_target IS 'Target date and time for countdown (typically midnight for New Year parties)';

-- Uploaders table
CREATE TABLE uploaders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_name TEXT
);

-- Photos table
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES uploaders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    original_path TEXT NOT NULL,
    tv_path TEXT NOT NULL,
    original_mime TEXT,
    tv_mime TEXT,
    original_bytes BIGINT,
    tv_bytes BIGINT,
    comment TEXT
);

-- Party join tokens table
CREATE TABLE party_join_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Parties indexes
CREATE INDEX idx_parties_status ON parties(status);
CREATE INDEX idx_parties_name ON parties(name);
CREATE INDEX idx_parties_admin_pin_hash ON parties(admin_pin_hash) WHERE admin_pin_hash IS NOT NULL;

-- Uploaders indexes
CREATE INDEX idx_uploaders_party_id ON uploaders(party_id);

-- Photos indexes
CREATE INDEX idx_photos_party_id ON photos(party_id);
CREATE INDEX idx_photos_party_created ON photos(party_id, created_at DESC);

-- Party join tokens indexes
CREATE INDEX idx_party_join_tokens_party_id ON party_join_tokens(party_id);
CREATE INDEX idx_party_join_tokens_token ON party_join_tokens(token);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_join_tokens ENABLE ROW LEVEL SECURITY;

-- Parties policies
CREATE POLICY "Parties are viewable by everyone" ON parties
    FOR SELECT USING (true);

-- Uploaders policies
CREATE POLICY "Uploaders are viewable by everyone" ON uploaders
    FOR SELECT USING (true);

-- Photos policies
CREATE POLICY "Photos are viewable by everyone" ON photos
    FOR SELECT USING (true);

CREATE POLICY "Allow photo inserts from clients" ON photos
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Party join tokens policies
CREATE POLICY "Anyone can read party join tokens" ON party_join_tokens
    FOR SELECT USING (true);

CREATE POLICY "Service can insert party join tokens" ON party_join_tokens
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update party join tokens" ON party_join_tokens
    FOR UPDATE USING (true);

CREATE POLICY "Service can delete party join tokens" ON party_join_tokens
    FOR DELETE USING (true);

-- ============================================================================
-- REALTIME
-- ============================================================================

-- Enable realtime for all relevant tables
ALTER TABLE photos REPLICA IDENTITY FULL;
ALTER TABLE uploaders REPLICA IDENTITY FULL;
ALTER TABLE parties REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE photos;
ALTER PUBLICATION supabase_realtime ADD TABLE uploaders;
ALTER PUBLICATION supabase_realtime ADD TABLE parties;

-- ============================================================================
-- STORAGE
-- ============================================================================

-- Create storage bucket for PhotoBooze images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'photobooze-images',
    'photobooze-images',
    true,
    26214400, -- 25MB in bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

-- Set up storage policies for the bucket
CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT USING (bucket_id = 'photobooze-images');

CREATE POLICY "Authenticated users can upload" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'photobooze-images');

CREATE POLICY "Authenticated users can update" ON storage.objects
    FOR UPDATE USING (bucket_id = 'photobooze-images');

CREATE POLICY "Authenticated users can delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'photobooze-images');
