-- Migration 010: Fix calls closer_id foreign key
-- The closer_id should reference profiles(id), not users table
--
-- This fixes the error:
-- "insert or update on table "calls" violates foreign key constraint "calls_closer_id_fkey"
--  Key is not present in table "users""

-- First, drop the incorrect foreign key constraint (if it exists)
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_closer_id_fkey;

-- Also drop any variant names that might exist
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_closer_id_fkey1;
ALTER TABLE calls DROP CONSTRAINT IF EXISTS fk_calls_closer;

-- Recreate the foreign key to correctly reference profiles(id)
ALTER TABLE calls
ADD CONSTRAINT calls_closer_id_fkey
FOREIGN KEY (closer_id)
REFERENCES profiles(id)
ON DELETE SET NULL;

-- Ensure the index exists for performance
CREATE INDEX IF NOT EXISTS idx_calls_closer_id ON calls(closer_id);

-- Add comment for documentation
COMMENT ON COLUMN calls.closer_id IS 'References profiles(id) - the closer who made this call';
