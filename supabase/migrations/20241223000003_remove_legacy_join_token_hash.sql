-- Remove legacy join_token_hash column now that we use party_join_tokens table
ALTER TABLE parties DROP COLUMN IF EXISTS join_token_hash;