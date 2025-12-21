-- PhotoBooze Initial Schema
-- Tables: parties, uploaders, photos

-- Parties table
CREATE TABLE parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    closed_at TIMESTAMPTZ,
    join_token_hash TEXT NOT NULL
);

-- Index for looking up parties by status
CREATE INDEX idx_parties_status ON parties(status);

-- Uploaders table
CREATE TABLE uploaders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_name TEXT
);

-- Index for looking up uploaders by party
CREATE INDEX idx_uploaders_party_id ON uploaders(party_id);

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

-- Index for looking up photos by party (most common query)
CREATE INDEX idx_photos_party_id ON photos(party_id);
CREATE INDEX idx_photos_party_created ON photos(party_id, created_at DESC);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- For service role access (our server), we bypass RLS
-- These policies are for potential future direct client access

-- Parties: readable by anyone (for join verification), writable by service role only
CREATE POLICY "Parties are viewable by everyone" ON parties
    FOR SELECT USING (true);

-- Uploaders: readable by party participants
CREATE POLICY "Uploaders are viewable by everyone" ON uploaders
    FOR SELECT USING (true);

-- Photos: readable by everyone (for TV display)
CREATE POLICY "Photos are viewable by everyone" ON photos
    FOR SELECT USING (true);

-- Note: INSERT/UPDATE/DELETE operations will be done via service role
-- which bypasses RLS, so we don't need policies for those operations
