-- Google Drive sync tracking tables
-- Each closer has their own Drive connection and synced files

-- Drive sync configuration (one per closer)
CREATE TABLE IF NOT EXISTS drive_sync_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL DEFAULT '',
    folder_name TEXT,
    last_sync_at TIMESTAMPTZ,
    auto_sync BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(closer_id)
);

-- Drive synced files (tracks which files were imported per closer)
CREATE TABLE IF NOT EXISTS drive_sync_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
    result_type TEXT, -- 'transcription', 'csv_detected'
    result_data JSONB,
    error_message TEXT,
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    processed_at TIMESTAMPTZ,
    UNIQUE(closer_id, drive_file_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drive_sync_config_closer ON drive_sync_config(closer_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_files_closer ON drive_sync_files(closer_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_files_drive_id ON drive_sync_files(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_drive_sync_files_status ON drive_sync_files(status);

-- RLS policies (each closer can only access their own data)
ALTER TABLE drive_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_sync_files ENABLE ROW LEVEL SECURITY;

-- Config policies
CREATE POLICY "Users can view own drive config"
    ON drive_sync_config FOR SELECT
    USING (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own drive config"
    ON drive_sync_config FOR INSERT
    WITH CHECK (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update own drive config"
    ON drive_sync_config FOR UPDATE
    USING (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

-- Files policies
CREATE POLICY "Users can view own synced files"
    ON drive_sync_files FOR SELECT
    USING (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own synced files"
    ON drive_sync_files FOR INSERT
    WITH CHECK (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update own synced files"
    ON drive_sync_files FOR UPDATE
    USING (closer_id IN (
        SELECT id FROM profiles WHERE user_id = auth.uid()
    ));

-- Admin can view all
CREATE POLICY "Admins can view all drive configs"
    ON drive_sync_config FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
    ));

CREATE POLICY "Admins can view all synced files"
    ON drive_sync_files FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
    ));

-- Updated_at trigger for config
CREATE OR REPLACE FUNCTION update_drive_sync_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_drive_sync_config_updated_at
    BEFORE UPDATE ON drive_sync_config
    FOR EACH ROW
    EXECUTE FUNCTION update_drive_sync_config_updated_at();
