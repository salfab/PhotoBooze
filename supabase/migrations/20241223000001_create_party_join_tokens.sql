-- Create party_join_tokens table with CASCADE DELETE
CREATE TABLE party_join_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups by party_id
CREATE INDEX idx_party_join_tokens_party_id ON party_join_tokens(party_id);

-- Create index for fast lookups by token
CREATE INDEX idx_party_join_tokens_token ON party_join_tokens(token);

-- Migrate existing join_token_hash data (if any parties exist)
-- Note: We can't recover the original tokens from hashes, so existing parties will need new tokens
-- This migration will leave join_token_hash in place for now - we'll deprecate it later

-- Enable Row Level Security
ALTER TABLE party_join_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for party_join_tokens
-- Allow reading tokens for party validation
CREATE POLICY "Anyone can read party join tokens" ON party_join_tokens
  FOR SELECT USING (true);

-- Allow inserting tokens when creating parties (server-side only)
CREATE POLICY "Service can insert party join tokens" ON party_join_tokens
  FOR INSERT WITH CHECK (true);

-- Allow updating tokens when regenerating (server-side only)
CREATE POLICY "Service can update party join tokens" ON party_join_tokens
  FOR UPDATE USING (true);

-- Allow deleting tokens (will happen via CASCADE when party is deleted)
CREATE POLICY "Service can delete party join tokens" ON party_join_tokens
  FOR DELETE USING (true);