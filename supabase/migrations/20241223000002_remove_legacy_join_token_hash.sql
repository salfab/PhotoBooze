-- Remove legacy join_token_hash column now that we use party_join_tokens table
ALTER TABLE parties DROP COLUMN join_token_hash;