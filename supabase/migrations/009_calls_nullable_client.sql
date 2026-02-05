-- Migration: Allow calls without client (for Drive imports)
-- Imported transcriptions may not have an associated client initially

-- Make client_id nullable on calls table
ALTER TABLE calls ALTER COLUMN client_id DROP NOT NULL;

-- Add comment explaining why client_id can be null
COMMENT ON COLUMN calls.client_id IS 'Can be NULL for Drive-imported transcriptions that haven''t been associated with a client yet';
