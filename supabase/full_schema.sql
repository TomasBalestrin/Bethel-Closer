-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types (with IF NOT EXISTS check)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'closer', 'lider');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE client_status AS ENUM ('lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE client_source AS ENUM ('organic', 'referral', 'ads', 'event', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ticket_type AS ENUM ('29_90', '12k', '80k');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_status AS ENUM ('scheduled', 'completed', 'no_show', 'rescheduled', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE call_classification AS ENUM ('hot', 'warm', 'cold', 'not_qualified');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'status_change');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role user_role DEFAULT 'closer' NOT NULL,
    phone VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add role column if it doesn't exist (for existing tables)
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN role user_role DEFAULT 'closer' NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    company VARCHAR(255),
    status client_status DEFAULT 'lead' NOT NULL,
    source client_source DEFAULT 'organic' NOT NULL,
    ticket_type ticket_type,
    entry_value DECIMAL(12, 2),
    sale_value DECIMAL(12, 2),
    closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    status call_status DEFAULT 'scheduled' NOT NULL,
    classification call_classification,
    notes TEXT,
    recording_url TEXT,
    ai_summary TEXT,
    ai_analysis JSONB,
    quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Client activities table
CREATE TABLE IF NOT EXISTS client_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    type activity_type NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Client notes table
CREATE TABLE IF NOT EXISTS client_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6366f1' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Client tags junction table
CREATE TABLE IF NOT EXISTS client_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(client_id, tag_id)
);

-- Monthly goals table
CREATE TABLE IF NOT EXISTS monthly_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    month DATE NOT NULL,
    target_calls INTEGER DEFAULT 0 NOT NULL,
    target_sales INTEGER DEFAULT 0 NOT NULL,
    target_revenue DECIMAL(12, 2) DEFAULT 0 NOT NULL,
    actual_calls INTEGER DEFAULT 0 NOT NULL,
    actual_sales INTEGER DEFAULT 0 NOT NULL,
    actual_revenue DECIMAL(12, 2) DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(closer_id, month)
);

-- =============================================
-- FIX: Add missing columns to existing tables
-- This block ensures all columns exist before creating policies/functions
-- =============================================

-- profiles: add user_id if missing
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- profiles: add role if missing
DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN role user_role DEFAULT 'closer';
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; WHEN undefined_object THEN null; END $$;

-- client_activities: add user_id if missing
DO $$ BEGIN
    ALTER TABLE client_activities ADD COLUMN user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- client_notes: add user_id if missing
DO $$ BEGIN
    ALTER TABLE client_notes ADD COLUMN user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- squads: add leader_id if missing
DO $$ BEGIN
    ALTER TABLE squads ADD COLUMN leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- squads: add description if missing
DO $$ BEGIN
    ALTER TABLE squads ADD COLUMN description TEXT;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- squad_members: add profile_id if missing
DO $$ BEGIN
    ALTER TABLE squad_members ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN null; WHEN undefined_table THEN null; END $$;

-- calls: make closer_id nullable if it exists
DO $$ BEGIN
    ALTER TABLE calls ALTER COLUMN closer_id DROP NOT NULL;
EXCEPTION WHEN undefined_column THEN null; WHEN undefined_table THEN null; END $$;

-- =============================================
-- END FIX
-- =============================================

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_closer_id ON clients(closer_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_closer_id ON calls(closer_id);
CREATE INDEX IF NOT EXISTS idx_calls_scheduled_at ON calls(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_client_activities_client_id ON client_activities(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_closer_id ON monthly_goals(closer_id);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_month ON monthly_goals(month);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_client_notes_updated_at ON client_notes;
CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON client_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_monthly_goals_updated_at ON monthly_goals;
CREATE TRIGGER update_monthly_goals_updated_at BEFORE UPDATE ON monthly_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_goals ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Clients policies (closers see their clients, admins see all)
CREATE POLICY "Closers can view own clients" ON clients FOR SELECT USING (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Closers can insert clients" ON clients FOR INSERT WITH CHECK (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Closers can update own clients" ON clients FOR UPDATE USING (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Admins can delete clients" ON clients FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Calls policies
CREATE POLICY "Users can view calls" ON calls FOR SELECT USING (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Users can insert calls" ON calls FOR INSERT WITH CHECK (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Users can update calls" ON calls FOR UPDATE USING (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);

-- Activities policies
CREATE POLICY "Users can view activities" ON client_activities FOR SELECT USING (true);
CREATE POLICY "Users can insert activities" ON client_activities FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Notes policies
CREATE POLICY "Users can view notes" ON client_notes FOR SELECT USING (true);
CREATE POLICY "Users can insert notes" ON client_notes FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update own notes" ON client_notes FOR UPDATE USING (
    user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Tags policies (all users can view, admins can manage)
CREATE POLICY "Users can view tags" ON tags FOR SELECT USING (true);
CREATE POLICY "Admins can manage tags" ON tags FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Client tags policies
CREATE POLICY "Users can view client tags" ON client_tags FOR SELECT USING (true);
CREATE POLICY "Users can manage client tags" ON client_tags FOR ALL USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND (
        c.closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
    ))
);

-- Monthly goals policies
CREATE POLICY "Users can view own goals" ON monthly_goals FOR SELECT USING (
    closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
CREATE POLICY "Admins can manage goals" ON monthly_goals FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
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

DROP TRIGGER IF EXISTS trigger_update_drive_sync_config_updated_at ON drive_sync_config;
CREATE TRIGGER trigger_update_drive_sync_config_updated_at
    BEFORE UPDATE ON drive_sync_config
    FOR EACH ROW
    EXECUTE FUNCTION update_drive_sync_config_updated_at();
-- Migration 007: Admin User Management
-- Fixes trigger issues, adds admin RLS policies, creates helper RPC functions
--
-- IMPORTANT: Run this in the Supabase SQL Editor or via `supabase db push`

-- =============================================
-- 1. Fix handle_new_user trigger
-- =============================================

-- Drop any existing trigger (commonly added via Supabase Dashboard)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create robust handle_new_user function with proper NULL handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (user_id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, ''), '@', 1),
      ''
    ),
    COALESCE(NEW.email, ''),
    'closer'::user_role
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    name = CASE
      WHEN profiles.name = '' OR profiles.name IS NULL
      THEN EXCLUDED.name
      ELSE profiles.name
    END;
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- 2. Admin RLS policies for profiles
-- =============================================

-- Allow admins to insert profiles for other users
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;
CREATE POLICY "Admins can insert profiles" ON profiles
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Expand UPDATE policy to include admins (drop + recreate)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Allow admins to delete profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;
CREATE POLICY "Admins can delete profiles" ON profiles
FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- =============================================
-- 3. Admin RPC function for profile creation
-- Bypasses RLS via SECURITY DEFINER
-- =============================================

CREATE OR REPLACE FUNCTION admin_create_profile(
  p_user_id UUID,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'closer'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  INSERT INTO profiles (user_id, name, email, phone, role)
  VALUES (p_user_id, p_name, p_email, p_phone, p_role::user_role)
  ON CONFLICT (user_id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    role = EXCLUDED.role;
END;
$$;

-- =============================================
-- 4. Bootstrap function for own profile
-- Used when admin's profile doesn't exist in DB
-- =============================================

CREATE OR REPLACE FUNCTION ensure_my_profile(
  p_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'closer'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile json;
  v_user_email TEXT;
BEGIN
  -- Get email from auth.users
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();

  -- Try to get existing profile
  SELECT row_to_json(p) INTO v_profile FROM profiles p WHERE user_id = auth.uid();

  IF v_profile IS NOT NULL THEN
    RETURN v_profile;
  END IF;

  -- Create profile
  INSERT INTO profiles (user_id, name, email, role)
  VALUES (
    auth.uid(),
    COALESCE(p_name, split_part(COALESCE(v_user_email, ''), '@', 1), ''),
    COALESCE(p_email, v_user_email, ''),
    p_role::user_role
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Return the profile
  SELECT row_to_json(p) INTO v_profile FROM profiles p WHERE user_id = auth.uid();
  RETURN v_profile;
END;
$$;
-- Migration 008: Squads system
-- Enables squad-based team management with leaders and members

-- =============================================
-- 1. Squads table
-- =============================================

CREATE TABLE IF NOT EXISTS squads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add missing columns to squads if they don't exist
DO $$ BEGIN
    ALTER TABLE squads ADD COLUMN leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE squads ADD COLUMN description TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- =============================================
-- 2. Squad members junction table
-- =============================================

CREATE TABLE IF NOT EXISTS squad_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    squad_id UUID REFERENCES squads(id) ON DELETE CASCADE NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(squad_id, profile_id)
);

-- Add missing columns to squad_members if they don't exist
DO $$ BEGIN
    ALTER TABLE squad_members ADD COLUMN profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- =============================================
-- 3. Indexes
-- =============================================

CREATE INDEX IF NOT EXISTS idx_squads_leader_id ON squads(leader_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_squad_id ON squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_profile_id ON squad_members(profile_id);

-- =============================================
-- 4. Triggers
-- =============================================

DROP TRIGGER IF EXISTS update_squads_updated_at ON squads;
CREATE TRIGGER update_squads_updated_at
  BEFORE UPDATE ON squads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 5. Row Level Security
-- =============================================

ALTER TABLE squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;

-- Squads policies
CREATE POLICY "Leaders and admins can view squads" ON squads
FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);

CREATE POLICY "Admins can insert squads" ON squads
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can update squads" ON squads
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can delete squads" ON squads
FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Squad members policies
CREATE POLICY "Leaders and admins can view squad members" ON squad_members
FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);

CREATE POLICY "Admins can insert squad members" ON squad_members
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can delete squad members" ON squad_members
FOR DELETE USING (
  EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- =============================================
-- 6. Update profiles UPDATE policy for leaders
-- =============================================

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role IN ('admin', 'lider'))
);
-- Migration: Allow calls without client (for Drive imports)
-- Imported transcriptions may not have an associated client initially

-- Make client_id nullable on calls table
ALTER TABLE calls ALTER COLUMN client_id DROP NOT NULL;

-- Add comment explaining why client_id can be null
COMMENT ON COLUMN calls.client_id IS 'Can be NULL for Drive-imported transcriptions that haven''t been associated with a client yet';
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
-- ============================================================
-- Migration 011: PRD Complete Schema Implementation
-- Adds all missing tables, columns, functions, triggers, and policies
-- as specified in the Bethel Closer PRD v1.0
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ENUM TYPES - Add missing types
-- ============================================================

-- Add 'financeiro' role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'financeiro';

-- Closer levels (8 levels)
DO $$ BEGIN
  CREATE TYPE closer_level AS ENUM (
    'assessor', 'executivo', 'pro', 'elite',
    'especialista', 'especialista_pro', 'especialista_elite', 'lider'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Closer classification by AI (5 levels)
DO $$ BEGIN
  CREATE TYPE closer_classification AS ENUM (
    'iniciante', 'intermediario', 'avancado', 'alta_performance', 'elite'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lead classification
DO $$ BEGIN
  CREATE TYPE lead_classification AS ENUM ('pos_venda', 'follow');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Lead temperature
DO $$ BEGIN
  CREATE TYPE lead_temperature AS ENUM ('quente', 'morno', 'frio');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CRM Call status (10 columns as per PRD)
DO $$ BEGIN
  CREATE TYPE crm_client_status AS ENUM (
    'call_realizada', 'repitch', 'pos_call_0_2', 'pos_call_3_7',
    'pos_call_8_15', 'pos_call_16_21', 'sinal_compromisso',
    'venda_realizada', 'aluno_nao_fit', 'pos_21_carterizacao'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Intensivo lead status (14 columns as per PRD)
DO $$ BEGIN
  CREATE TYPE intensivo_lead_status AS ENUM (
    'abordagem_inicial', 'nivel_consciencia', 'convite_intensivo',
    'aguardando_confirmacao', 'confirmados', 'ingresso_retirado',
    'aquecimento_30d', 'aquecimento_15d', 'aquecimento_7d', 'aquecimento_1d',
    'compareceram', 'nao_compareceram', 'sem_interesse', 'proximo_intensivo'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Call status (PRD version)
DO $$ BEGIN
  CREATE TYPE prd_call_status AS ENUM (
    'pendente', 'em_andamento', 'follow_up', 'proposta_enviada', 'vendido', 'perdido'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ticket types (PRD version)
DO $$ BEGIN
  CREATE TYPE portfolio_ticket AS ENUM ('29_90', '12k', '80k');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notification types
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM ('followup', 'alert', 'info', 'success', 'warning');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Import file status
DO $$ BEGIN
  CREATE TYPE import_file_status AS ENUM ('pending', 'processing', 'completed', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- System log level
DO $$ BEGIN
  CREATE TYPE log_level AS ENUM ('info', 'warning', 'error', 'debug');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Activity absence reason
DO $$ BEGIN
  CREATE TYPE absence_reason AS ENUM (
    'call_curta', 'cliente_nao_permitiu', 'etapa_pulada',
    'transicao_prematura', 'nao_aplicavel', 'reagendamento_tomador_decisao'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indication type
DO $$ BEGIN
  CREATE TYPE indication_type AS ENUM ('call', 'intensivo');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indication status
DO $$ BEGIN
  CREATE TYPE indication_status AS ENUM ('pending', 'contacted', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Student activity type
DO $$ BEGIN
  CREATE TYPE student_activity_type AS ENUM ('intensivo', 'mentoria', 'evento');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Automation trigger type
DO $$ BEGIN
  CREATE TYPE automation_trigger_type AS ENUM (
    'days_in_column', 'followup_date_reached', 'tag_added',
    'data_completed', 'no_interaction'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Automation action type
DO $$ BEGIN
  CREATE TYPE automation_action_type AS ENUM (
    'move_to_column', 'add_tag', 'remove_tag',
    'send_notification', 'mark_super_hot'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. USER ROLES TABLE (separate from profiles as per PRD)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role user_role NOT NULL DEFAULT 'closer',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);

-- ============================================================
-- 3. ADD MISSING COLUMNS TO PROFILES
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS closer_level closer_level DEFAULT 'assessor',
  ADD COLUMN IF NOT EXISTS google_connected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS google_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS drive_folder_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS auto_import_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS import_frequency VARCHAR(20) DEFAULT '1h',
  ADD COLUMN IF NOT EXISTS import_file_types TEXT[] DEFAULT ARRAY['txt', 'docx'],
  ADD COLUMN IF NOT EXISTS import_name_patterns TEXT[],
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- ============================================================
-- 4. ADD MISSING COLUMNS TO CLIENTS
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS crm_status crm_client_status DEFAULT 'call_realizada',
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS data_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS repitch_notification_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS name_normalized VARCHAR(255),
  ADD COLUMN IF NOT EXISTS sdr_responsavel VARCHAR(100),
  ADD COLUMN IF NOT EXISTS funnel_source VARCHAR(100),
  ADD COLUMN IF NOT EXISTS product_offered VARCHAR(100),
  ADD COLUMN IF NOT EXISTS instagram VARCHAR(255),
  ADD COLUMN IF NOT EXISTS niche VARCHAR(100),
  ADD COLUMN IF NOT EXISTS main_pain TEXT,
  ADD COLUMN IF NOT EXISTS main_difficulty TEXT,
  ADD COLUMN IF NOT EXISTS has_partner BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monthly_revenue DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS followup_date DATE,
  ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contract_validity INTEGER,
  ADD COLUMN IF NOT EXISTS sale_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_super_hot BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_indication BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS indication_source_id UUID,
  ADD COLUMN IF NOT EXISTS days_in_column INTEGER DEFAULT 0;

-- Create index for normalized name
CREATE INDEX IF NOT EXISTS idx_clients_name_normalized ON clients(name_normalized);
CREATE INDEX IF NOT EXISTS idx_clients_crm_status ON clients(crm_status);
CREATE INDEX IF NOT EXISTS idx_clients_followup_date ON clients(followup_date);
CREATE INDEX IF NOT EXISTS idx_clients_is_sold ON clients(is_sold);

-- ============================================================
-- 5. ADD MISSING COLUMNS TO CALLS
-- ============================================================

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS call_date DATE,
  ADD COLUMN IF NOT EXISTS call_time TIME,
  ADD COLUMN IF NOT EXISTS product VARCHAR(100),
  ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score >= 0 AND score <= 10),
  ADD COLUMN IF NOT EXISTS prd_status prd_call_status DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS sale_value DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS entry_value DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS main_errors TEXT[],
  ADD COLUMN IF NOT EXISTS main_wins TEXT[],
  ADD COLUMN IF NOT EXISTS loss_point TEXT,
  ADD COLUMN IF NOT EXISTS niche VARCHAR(100),
  ADD COLUMN IF NOT EXISTS main_pain TEXT,
  ADD COLUMN IF NOT EXISTS main_difficulty TEXT,
  ADD COLUMN IF NOT EXISTS call_conclusion TEXT,
  ADD COLUMN IF NOT EXISTS technical_analysis JSONB,
  ADD COLUMN IF NOT EXISTS merged_with_call_id UUID REFERENCES calls(id),
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS observation TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS next_contact_date DATE,
  ADD COLUMN IF NOT EXISTS google_doc_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_file_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS has_partner BOOLEAN,
  ADD COLUMN IF NOT EXISTS consciousness_level TEXT,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_classification_enum lead_classification,
  ADD COLUMN IF NOT EXISTS closer_classification_enum closer_classification,
  ADD COLUMN IF NOT EXISTS analysis_metadata JSONB,
  ADD COLUMN IF NOT EXISTS analysis_quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS lead_temperature lead_temperature,
  ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Create unique index for content hash to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_content_hash_unique
  ON calls(closer_id, content_hash) WHERE content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calls_source_file_id ON calls(source_file_id);
CREATE INDEX IF NOT EXISTS idx_calls_merged_with ON calls(merged_with_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_prd_status ON calls(prd_status);
CREATE INDEX IF NOT EXISTS idx_calls_call_date ON calls(call_date);

-- ============================================================
-- 6. NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type notification_type DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- ============================================================
-- 7. PORTFOLIO STUDENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS portfolio_students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  closer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  niche VARCHAR(100),
  current_ticket portfolio_ticket NOT NULL DEFAULT '29_90',
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolio_students_closer_id ON portfolio_students(closer_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_students_client_id ON portfolio_students(client_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_students_current_ticket ON portfolio_students(current_ticket);
CREATE INDEX IF NOT EXISTS idx_portfolio_students_entry_date ON portfolio_students(entry_date);

-- ============================================================
-- 8. STUDENT ACTIVITIES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS student_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES portfolio_students(id) ON DELETE CASCADE,
  type student_activity_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  activity_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_student_activities_student_id ON student_activities(student_id);
CREATE INDEX IF NOT EXISTS idx_student_activities_type ON student_activities(type);
CREATE INDEX IF NOT EXISTS idx_student_activities_date ON student_activities(activity_date);

-- ============================================================
-- 9. TICKET UPGRADES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_upgrades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES portfolio_students(id) ON DELETE CASCADE,
  from_ticket portfolio_ticket NOT NULL,
  to_ticket portfolio_ticket NOT NULL,
  sale_value DECIMAL(12, 2),
  entry_value DECIMAL(12, 2),
  notes TEXT,
  upgraded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_upgrades_student_id ON ticket_upgrades(student_id);
CREATE INDEX IF NOT EXISTS idx_ticket_upgrades_upgraded_at ON ticket_upgrades(upgraded_at);

-- ============================================================
-- 10. INDICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS indications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  indicated_by_type VARCHAR(20) NOT NULL, -- 'client', 'student', 'closer'
  indicated_by_id UUID NOT NULL,
  indicated_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  type indication_type NOT NULL,
  status indication_status DEFAULT 'pending',
  closer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  converted_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  converted_lead_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_indications_indicated_by ON indications(indicated_by_type, indicated_by_id);
CREATE INDEX IF NOT EXISTS idx_indications_closer_id ON indications(closer_id);
CREATE INDEX IF NOT EXISTS idx_indications_status ON indications(status);
CREATE INDEX IF NOT EXISTS idx_indications_type ON indications(type);

-- ============================================================
-- 11. CRM AUTOMATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  trigger_type automation_trigger_type NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  action_type automation_action_type NOT NULL,
  action_config JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_automations_is_active ON crm_automations(is_active);
CREATE INDEX IF NOT EXISTS idx_crm_automations_trigger_type ON crm_automations(trigger_type);

-- ============================================================
-- 12. AUTOMATION LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  result JSONB,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_automation_id ON automation_logs(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_client_id ON automation_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed_at ON automation_logs(executed_at);

-- ============================================================
-- 13. CRM COLUMN SETTINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_column_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  column_id VARCHAR(50) NOT NULL,
  title VARCHAR(100),
  subtitle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, column_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_column_settings_user_id ON crm_column_settings(user_id);

-- ============================================================
-- 14. IMPORTED FILES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS imported_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  status import_file_status DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  started_processing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  content_hash VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_imported_files_drive_file_id ON imported_files(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_imported_files_user_id ON imported_files(user_id);
CREATE INDEX IF NOT EXISTS idx_imported_files_status ON imported_files(status);
CREATE INDEX IF NOT EXISTS idx_imported_files_created_at ON imported_files(created_at);

-- ============================================================
-- 15. IMPORT PROGRESS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS import_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  total_files INTEGER DEFAULT 0,
  processed_files INTEGER DEFAULT 0,
  successful_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  current_file VARCHAR(500),
  status VARCHAR(20) DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_progress_user_id ON import_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_import_progress_session_id ON import_progress(session_id);

-- ============================================================
-- 16. USER IMPORT SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_import_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type VARCHAR(50) NOT NULL, -- 'manual', 'auto', 'initial'
  files_found INTEGER DEFAULT 0,
  files_processed INTEGER DEFAULT 0,
  files_successful INTEGER DEFAULT 0,
  files_skipped INTEGER DEFAULT 0,
  files_failed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_import_sessions_user_id ON user_import_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_import_sessions_started_at ON user_import_sessions(started_at);

-- ============================================================
-- 17. SYSTEM LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level log_level NOT NULL DEFAULT 'info',
  service VARCHAR(100) NOT NULL,
  operation VARCHAR(100),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  error_message TEXT,
  stack_trace TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_service ON system_logs(service);
CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at);

-- Partition hint for future: consider partitioning by created_at

-- ============================================================
-- 18. API COSTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS api_costs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service VARCHAR(100) NOT NULL, -- 'openai', 'google_drive', etc.
  model VARCHAR(100), -- 'gpt-4o', 'gpt-4o-mini', etc.
  operation VARCHAR(100),
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 6),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_costs_service ON api_costs(service);
CREATE INDEX IF NOT EXISTS idx_api_costs_user_id ON api_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_costs_created_at ON api_costs(created_at);

-- ============================================================
-- 19. API RATE LIMITS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service VARCHAR(100) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, service, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_user_service ON api_rate_limits(user_id, service);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start);

-- ============================================================
-- 20. CALLS BACKUP TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS calls_backup (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_id UUID NOT NULL,
  data JSONB NOT NULL,
  operation VARCHAR(20) NOT NULL, -- 'UPDATE', 'DELETE'
  backed_up_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  backed_up_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_backup_call_id ON calls_backup(call_id);
CREATE INDEX IF NOT EXISTS idx_calls_backup_backed_up_at ON calls_backup(backed_up_at);

-- ============================================================
-- 21. CLIENTS BACKUP TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS clients_backup (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL,
  data JSONB NOT NULL,
  operation VARCHAR(20) NOT NULL, -- 'UPDATE', 'DELETE'
  backed_up_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  backed_up_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_backup_client_id ON clients_backup(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_backup_backed_up_at ON clients_backup(backed_up_at);

-- ============================================================
-- 22. ADMIN AUDIT LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_performed_by ON admin_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_type ON admin_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON admin_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);

-- ============================================================
-- 23. DAILY VERSES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_verses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_of_year INTEGER NOT NULL CHECK (day_of_year >= 1 AND day_of_year <= 366),
  verse_text TEXT NOT NULL,
  reference VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(day_of_year)
);

CREATE INDEX IF NOT EXISTS idx_daily_verses_day ON daily_verses(day_of_year);

-- ============================================================
-- 24. INTENSIVE EDITIONS TABLE (rename/enhance)
-- ============================================================

CREATE TABLE IF NOT EXISTS intensive_editions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  location VARCHAR(255),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intensive_editions_is_active ON intensive_editions(is_active);
CREATE INDEX IF NOT EXISTS idx_intensive_editions_event_date ON intensive_editions(event_date);

-- ============================================================
-- 25. INTENSIVE LEADS TABLE (enhanced)
-- ============================================================

-- Drop old table if exists and recreate with full schema
DROP TABLE IF EXISTS intensive_lead_notes CASCADE;

CREATE TABLE IF NOT EXISTS intensive_leads_new (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edition_id UUID REFERENCES intensive_editions(id) ON DELETE CASCADE,
  closer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  company VARCHAR(255),
  niche VARCHAR(100),
  source VARCHAR(100),
  temperature lead_temperature DEFAULT 'morno',
  status intensivo_lead_status DEFAULT 'abordagem_inicial',
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  ticket_retrieved_at TIMESTAMPTZ,
  attended_at TIMESTAMPTZ,
  source_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  source_student_id UUID REFERENCES portfolio_students(id) ON DELETE SET NULL,
  indication_id UUID REFERENCES indications(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Migrate data from old table if exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'intensivo_leads') THEN
    INSERT INTO intensive_leads_new (id, closer_id, name, phone, email, company, notes, created_at, updated_at)
    SELECT id, closer_id, name, phone, email, company, notes, created_at, updated_at
    FROM intensivo_leads
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

DROP TABLE IF EXISTS intensivo_leads CASCADE;
ALTER TABLE intensive_leads_new RENAME TO intensive_leads;

CREATE INDEX IF NOT EXISTS idx_intensive_leads_edition_id ON intensive_leads(edition_id);
CREATE INDEX IF NOT EXISTS idx_intensive_leads_closer_id ON intensive_leads(closer_id);
CREATE INDEX IF NOT EXISTS idx_intensive_leads_status ON intensive_leads(status);
CREATE INDEX IF NOT EXISTS idx_intensive_leads_temperature ON intensive_leads(temperature);

-- ============================================================
-- 26. INTENSIVE LEAD NOTES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS intensive_lead_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES intensive_leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_intensive_lead_notes_lead_id ON intensive_lead_notes(lead_id);

-- ============================================================
-- 27. CLIENT MENTORIA EXTRA TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS client_mentoria_extra (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  mentoria_name VARCHAR(255) NOT NULL,
  mentoria_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_mentoria_extra_client_id ON client_mentoria_extra(client_id);

-- ============================================================
-- 28. CLIENT INTENSIVO PARTICIPATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS client_intensivo_participations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  edition_id UUID REFERENCES intensive_editions(id) ON DELETE SET NULL,
  participated BOOLEAN DEFAULT FALSE,
  participation_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_intensivo_client_id ON client_intensivo_participations(client_id);

-- ============================================================
-- PART 2: SECURITY DEFINER FUNCTIONS
-- ============================================================

-- ============================================================
-- F1. has_role() - Check user role without RLS recursion
-- ============================================================

CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role user_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  ) OR EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- ============================================================
-- F2. is_squad_leader() - Check if user is leader of a squad
-- ============================================================

CREATE OR REPLACE FUNCTION is_squad_leader(_user_id UUID, _squad_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
BEGIN
  SELECT id INTO _profile_id FROM profiles WHERE user_id = _user_id;

  IF _squad_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM squads WHERE leader_id = _profile_id
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM squads WHERE id = _squad_id AND leader_id = _profile_id
    );
  END IF;
END;
$$;

-- ============================================================
-- F3. is_squad_leader_of_user() - Check if leader manages user
-- ============================================================

CREATE OR REPLACE FUNCTION is_squad_leader_of_user(_leader_id UUID, _member_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _leader_profile_id UUID;
  _member_profile_id UUID;
BEGIN
  SELECT id INTO _leader_profile_id FROM profiles WHERE user_id = _leader_id;
  SELECT id INTO _member_profile_id FROM profiles WHERE user_id = _member_user_id;

  RETURN EXISTS (
    SELECT 1 FROM squads s
    JOIN squad_members sm ON sm.squad_id = s.id
    WHERE s.leader_id = _leader_profile_id
    AND sm.profile_id = _member_profile_id
  );
END;
$$;

-- ============================================================
-- F4. normalize_client_name() - Normalize name for deduplication
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_client_name(_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN LOWER(TRIM(REGEXP_REPLACE(unaccent(_name), '\s+', ' ', 'g')));
END;
$$;

-- ============================================================
-- F5. map_product_to_ticket() - Map product to ticket type
-- ============================================================

CREATE OR REPLACE FUNCTION map_product_to_ticket(_product TEXT)
RETURNS portfolio_ticket
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE LOWER(_product)
    WHEN 'intensivo da alta performance' THEN RETURN '29_90';
    WHEN 'bethel club' THEN RETURN '29_90';
    WHEN 'implementacao comercial' THEN RETURN '12k';
    WHEN 'mentoria premium' THEN RETURN '12k';
    WHEN 'implementacao de ia' THEN RETURN '12k';
    WHEN 'nexttrack' THEN RETURN '12k';
    WHEN 'mentoria elite premium' THEN RETURN '80k';
    WHEN 'elite premium' THEN RETURN '80k';
    ELSE RETURN '12k';
  END CASE;
END;
$$;

-- ============================================================
-- F6. claim_pending_files() - Atomic lock for file processing
-- ============================================================

CREATE OR REPLACE FUNCTION claim_pending_files(_user_id UUID, _max_files INTEGER DEFAULT 5)
RETURNS SETOF imported_files
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE imported_files
  SET
    status = 'processing',
    started_processing_at = NOW(),
    updated_at = NOW()
  WHERE id IN (
    SELECT id FROM imported_files
    WHERE user_id = _user_id
    AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT _max_files
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ============================================================
-- F7. log_api_cost() - Log API usage with cost calculation
-- ============================================================

CREATE OR REPLACE FUNCTION log_api_cost(
  _service VARCHAR(100),
  _model VARCHAR(100),
  _operation VARCHAR(100),
  _tokens_input INTEGER,
  _tokens_output INTEGER,
  _user_id UUID DEFAULT NULL,
  _call_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost DECIMAL(10, 6);
  _new_id UUID;
BEGIN
  -- Calculate cost based on model (prices per 1M tokens)
  CASE _model
    WHEN 'gpt-4o' THEN
      _cost := (_tokens_input * 2.5 / 1000000) + (_tokens_output * 10.0 / 1000000);
    WHEN 'gpt-4o-mini' THEN
      _cost := (_tokens_input * 0.15 / 1000000) + (_tokens_output * 0.6 / 1000000);
    WHEN 'gpt-4-turbo' THEN
      _cost := (_tokens_input * 10.0 / 1000000) + (_tokens_output * 30.0 / 1000000);
    ELSE
      _cost := (_tokens_input * 1.0 / 1000000) + (_tokens_output * 2.0 / 1000000);
  END CASE;

  INSERT INTO api_costs (service, model, operation, tokens_input, tokens_output, estimated_cost_usd, user_id, call_id, metadata)
  VALUES (_service, _model, _operation, _tokens_input, _tokens_output, _cost, _user_id, _call_id, _metadata)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- ============================================================
-- F8. log_event() - Log system events
-- ============================================================

CREATE OR REPLACE FUNCTION log_event(
  _level log_level,
  _service VARCHAR(100),
  _operation VARCHAR(100) DEFAULT NULL,
  _user_id UUID DEFAULT NULL,
  _duration_ms INTEGER DEFAULT NULL,
  _error_message TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id UUID;
BEGIN
  INSERT INTO system_logs (level, service, operation, user_id, duration_ms, error_message, metadata)
  VALUES (_level, _service, _operation, _user_id, _duration_ms, _error_message, _metadata)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- ============================================================
-- F9. insert_audit_log() - Insert admin audit log
-- ============================================================

CREATE OR REPLACE FUNCTION insert_audit_log(
  _performed_by UUID,
  _action_type VARCHAR(100),
  _entity_type VARCHAR(100),
  _entity_id UUID DEFAULT NULL,
  _old_value JSONB DEFAULT NULL,
  _new_value JSONB DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id UUID;
BEGIN
  INSERT INTO admin_audit_logs (performed_by, action_type, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (_performed_by, _action_type, _entity_type, _entity_id, _old_value, _new_value, _metadata)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- ============================================================
-- F10. check_rate_limit() - Check if user is within rate limit
-- ============================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  _user_id UUID,
  _service VARCHAR(100),
  _max_requests INTEGER DEFAULT 100,
  _window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_count INTEGER;
  _window_start TIMESTAMPTZ;
BEGIN
  _window_start := date_trunc('hour', NOW());

  SELECT COALESCE(request_count, 0) INTO _current_count
  FROM api_rate_limits
  WHERE user_id = _user_id
  AND service = _service
  AND window_start = _window_start;

  RETURN COALESCE(_current_count, 0) < _max_requests;
END;
$$;

-- ============================================================
-- F11. increment_rate_limit() - Increment rate limit counter
-- ============================================================

CREATE OR REPLACE FUNCTION increment_rate_limit(
  _user_id UUID,
  _service VARCHAR(100),
  _tokens_used INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_start TIMESTAMPTZ;
BEGIN
  _window_start := date_trunc('hour', NOW());

  INSERT INTO api_rate_limits (user_id, service, window_start, request_count, tokens_used)
  VALUES (_user_id, _service, _window_start, 1, _tokens_used)
  ON CONFLICT (user_id, service, window_start)
  DO UPDATE SET
    request_count = api_rate_limits.request_count + 1,
    tokens_used = api_rate_limits.tokens_used + _tokens_used,
    updated_at = NOW();
END;
$$;

-- ============================================================
-- F12. cleanup_old_logs() - Remove logs older than 90 days
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INTEGER;
BEGIN
  DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

-- ============================================================
-- F13. cleanup_old_backups() - Remove backups older than 180 days
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_backups()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted_calls INTEGER;
  _deleted_clients INTEGER;
BEGIN
  DELETE FROM calls_backup WHERE backed_up_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS _deleted_calls = ROW_COUNT;

  DELETE FROM clients_backup WHERE backed_up_at < NOW() - INTERVAL '180 days';
  GET DIAGNOSTICS _deleted_clients = ROW_COUNT;

  RETURN _deleted_calls + _deleted_clients;
END;
$$;

-- ============================================================
-- F14. cleanup_old_rate_limits() - Remove rate limits older than 2h
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INTEGER;
BEGIN
  DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '2 hours';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

-- ============================================================
-- F15. restore_call_from_backup() - Restore a call from backup
-- ============================================================

CREATE OR REPLACE FUNCTION restore_call_from_backup(_backup_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _backup_data JSONB;
  _call_id UUID;
  _is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT has_role(auth.uid(), 'admin') INTO _is_admin;
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Only admins can restore backups';
  END IF;

  SELECT data, call_id INTO _backup_data, _call_id
  FROM calls_backup WHERE id = _backup_id;

  IF _backup_data IS NULL THEN
    RAISE EXCEPTION 'Backup not found';
  END IF;

  -- Update the call with backup data
  UPDATE calls SET
    client_id = (_backup_data->>'client_id')::UUID,
    client_name = _backup_data->>'client_name',
    call_date = (_backup_data->>'call_date')::DATE,
    score = (_backup_data->>'score')::INTEGER,
    prd_status = (_backup_data->>'prd_status')::prd_call_status,
    ai_summary = _backup_data->>'ai_summary',
    technical_analysis = _backup_data->'technical_analysis',
    updated_at = NOW()
  WHERE id = _call_id;

  RETURN _call_id;
END;
$$;

-- ============================================================
-- F16. create_notification() - Create notification for user
-- ============================================================

CREATE OR REPLACE FUNCTION create_notification(
  _user_id UUID,
  _title VARCHAR(255),
  _message TEXT,
  _type notification_type DEFAULT 'info',
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id UUID;
BEGIN
  INSERT INTO notifications (user_id, title, message, type, metadata)
  VALUES (_user_id, _title, _message, _type, _metadata)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

-- ============================================================
-- PART 3: TRIGGERS
-- ============================================================

-- ============================================================
-- T1. Handle new user - Create profile and role
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _full_name TEXT;
BEGIN
  -- Extract name from metadata or email
  _full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create profile
  INSERT INTO profiles (user_id, name, email, role)
  VALUES (NEW.id, _full_name, NEW.email, 'closer')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create user_role
  INSERT INTO user_roles (user_id, role)
  VALUES (NEW.id, 'closer')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any and create new
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- T2. Normalize client name on insert/update
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_client_name_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name_normalized := normalize_client_name(NEW.name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_client_name_on_change ON clients;
CREATE TRIGGER normalize_client_name_on_change
  BEFORE INSERT OR UPDATE OF name ON clients
  FOR EACH ROW EXECUTE FUNCTION normalize_client_name_trigger();

-- ============================================================
-- T3. Update status_changed_at on client status change
-- ============================================================

CREATE OR REPLACE FUNCTION update_client_status_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.crm_status IS DISTINCT FROM NEW.crm_status THEN
    NEW.status_changed_at := NOW();
    NEW.days_in_column := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_status_changed ON clients;
CREATE TRIGGER client_status_changed
  BEFORE UPDATE OF crm_status ON clients
  FOR EACH ROW EXECUTE FUNCTION update_client_status_changed_at();

-- ============================================================
-- T4. Migrate client to portfolio on pos_21_carterizacao
-- ============================================================

CREATE OR REPLACE FUNCTION migrate_client_to_portfolio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket portfolio_ticket;
BEGIN
  IF NEW.crm_status = 'pos_21_carterizacao' AND OLD.crm_status IS DISTINCT FROM 'pos_21_carterizacao' THEN
    -- Check if already exists
    IF NOT EXISTS (SELECT 1 FROM portfolio_students WHERE client_id = NEW.id) THEN
      -- Determine ticket based on sale value
      IF NEW.sale_value >= 50000 THEN
        _ticket := '80k';
      ELSIF NEW.sale_value >= 5000 THEN
        _ticket := '12k';
      ELSE
        _ticket := '29_90';
      END IF;

      -- Insert into portfolio
      INSERT INTO portfolio_students (closer_id, client_id, name, phone, email, niche, current_ticket)
      VALUES (NEW.closer_id, NEW.id, NEW.name, NEW.phone, NEW.email, NEW.niche, _ticket);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_to_portfolio ON clients;
CREATE TRIGGER client_to_portfolio
  AFTER UPDATE OF crm_status ON clients
  FOR EACH ROW EXECUTE FUNCTION migrate_client_to_portfolio();

-- ============================================================
-- T5. Update portfolio ticket on sale
-- ============================================================

CREATE OR REPLACE FUNCTION update_portfolio_ticket_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket portfolio_ticket;
BEGIN
  IF NEW.is_sold = TRUE AND OLD.is_sold IS DISTINCT FROM TRUE THEN
    -- Determine ticket from product
    _ticket := map_product_to_ticket(NEW.product_offered);

    -- Update portfolio if exists
    UPDATE portfolio_students
    SET current_ticket = _ticket, updated_at = NOW()
    WHERE client_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_sale_update_portfolio ON clients;
CREATE TRIGGER client_sale_update_portfolio
  AFTER UPDATE OF is_sold ON clients
  FOR EACH ROW EXECUTE FUNCTION update_portfolio_ticket_on_sale();

-- ============================================================
-- T6. Backup call before change
-- ============================================================

CREATE OR REPLACE FUNCTION backup_call_before_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO calls_backup (call_id, data, operation, backed_up_by)
  VALUES (
    OLD.id,
    to_jsonb(OLD),
    TG_OP,
    auth.uid()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS backup_call_on_change ON calls;
CREATE TRIGGER backup_call_on_change
  BEFORE UPDATE OR DELETE ON calls
  FOR EACH ROW EXECUTE FUNCTION backup_call_before_change();

-- ============================================================
-- T7. Backup client before change
-- ============================================================

CREATE OR REPLACE FUNCTION backup_client_before_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO clients_backup (client_id, data, operation, backed_up_by)
  VALUES (
    OLD.id,
    to_jsonb(OLD),
    TG_OP,
    auth.uid()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS backup_client_on_change ON clients;
CREATE TRIGGER backup_client_on_change
  BEFORE UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION backup_client_before_change();

-- ============================================================
-- T8. Reset repitch notification on status change
-- ============================================================

CREATE OR REPLACE FUNCTION reset_repitch_notification_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.crm_status = 'repitch' AND NEW.crm_status IS DISTINCT FROM 'repitch' THEN
    NEW.repitch_notification_sent := FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_repitch_notification ON clients;
CREATE TRIGGER reset_repitch_notification
  BEFORE UPDATE OF crm_status ON clients
  FOR EACH ROW EXECUTE FUNCTION reset_repitch_notification_on_status_change();

-- ============================================================
-- T9. Check client data completion
-- ============================================================

CREATE OR REPLACE FUNCTION check_client_data_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check if required fields are filled
  IF NEW.phone IS NOT NULL
     AND NEW.email IS NOT NULL
     AND NEW.niche IS NOT NULL
     AND NEW.main_pain IS NOT NULL
     AND NEW.data_completed_at IS NULL THEN
    NEW.data_completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_data_completion_check ON clients;
CREATE TRIGGER client_data_completion_check
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION check_client_data_completion();

-- ============================================================
-- T10. Update intensive lead status_changed_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_intensive_lead_status_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.status_changed_at := NOW();

    -- Set timestamps based on status
    IF NEW.status = 'confirmados' AND NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := NOW();
    ELSIF NEW.status = 'ingresso_retirado' AND NEW.ticket_retrieved_at IS NULL THEN
      NEW.ticket_retrieved_at := NOW();
    ELSIF NEW.status = 'compareceram' AND NEW.attended_at IS NULL THEN
      NEW.attended_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intensive_lead_status_changed ON intensive_leads;
CREATE TRIGGER intensive_lead_status_changed
  BEFORE UPDATE OF status ON intensive_leads
  FOR EACH ROW EXECUTE FUNCTION update_intensive_lead_status_changed_at();

-- ============================================================
-- T11. Validate lead temperature
-- ============================================================

CREATE OR REPLACE FUNCTION validate_lead_temperature()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.temperature NOT IN ('quente', 'morno', 'frio') THEN
    RAISE EXCEPTION 'Invalid temperature value: %', NEW.temperature;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_intensive_lead_temperature ON intensive_leads;
CREATE TRIGGER validate_intensive_lead_temperature
  BEFORE INSERT OR UPDATE OF temperature ON intensive_leads
  FOR EACH ROW EXECUTE FUNCTION validate_lead_temperature();

-- ============================================================
-- T12. updated_at triggers for new tables
-- ============================================================

DROP TRIGGER IF EXISTS update_portfolio_students_updated_at ON portfolio_students;
CREATE TRIGGER update_portfolio_students_updated_at
  BEFORE UPDATE ON portfolio_students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_automations_updated_at ON crm_automations;
CREATE TRIGGER update_crm_automations_updated_at
  BEFORE UPDATE ON crm_automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_crm_column_settings_updated_at ON crm_column_settings;
CREATE TRIGGER update_crm_column_settings_updated_at
  BEFORE UPDATE ON crm_column_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_imported_files_updated_at ON imported_files;
CREATE TRIGGER update_imported_files_updated_at
  BEFORE UPDATE ON imported_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_indications_updated_at ON indications;
CREATE TRIGGER update_indications_updated_at
  BEFORE UPDATE ON indications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intensive_editions_updated_at ON intensive_editions;
CREATE TRIGGER update_intensive_editions_updated_at
  BEFORE UPDATE ON intensive_editions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_intensive_leads_updated_at ON intensive_leads;
CREATE TRIGGER update_intensive_leads_updated_at
  BEFORE UPDATE ON intensive_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_rate_limits_updated_at ON api_rate_limits;
CREATE TRIGGER update_api_rate_limits_updated_at
  BEFORE UPDATE ON api_rate_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PART 4: VIEWS
-- ============================================================

-- ============================================================
-- V1. System metrics 24h
-- ============================================================

CREATE OR REPLACE VIEW system_metrics_24h AS
SELECT
  service,
  COUNT(*) FILTER (WHERE level = 'error') as error_count,
  COUNT(*) FILTER (WHERE level = 'warning') as warning_count,
  COUNT(*) as total_operations,
  ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  ROUND(
    (COUNT(*) FILTER (WHERE level != 'error')::numeric / NULLIF(COUNT(*), 0) * 100)::numeric,
    2
  ) as success_rate_pct
FROM system_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY service
ORDER BY error_count DESC, total_operations DESC;

-- ============================================================
-- V2. Stuck files report
-- ============================================================

CREATE OR REPLACE VIEW stuck_files_report AS
SELECT
  f.id,
  f.file_name,
  f.status,
  EXTRACT(EPOCH FROM (NOW() - f.started_processing_at)) / 60 as minutes_stuck,
  f.retry_count,
  p.name as user_name,
  f.created_at
FROM imported_files f
JOIN profiles p ON p.user_id = f.user_id
WHERE f.status = 'processing'
AND f.started_processing_at < NOW() - INTERVAL '5 minutes'
ORDER BY f.started_processing_at ASC;

-- ============================================================
-- V3. Profiles safe (without Google tokens)
-- ============================================================

CREATE OR REPLACE VIEW profiles_safe AS
SELECT
  id, user_id, name, email, avatar_url, role, phone,
  closer_level, google_connected, google_email,
  drive_folder_id, drive_folder_name,
  auto_import_enabled, import_frequency,
  last_sync_at, status,
  created_at, updated_at
FROM profiles;

-- ============================================================
-- PART 5: ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE indications ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_column_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE imported_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_verses ENABLE ROW LEVEL SECURITY;
ALTER TABLE intensive_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intensive_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE intensive_lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_mentoria_extra ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_intensivo_participations ENABLE ROW LEVEL SECURITY;

-- User roles policies
CREATE POLICY "Users can view own role" ON user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage roles" ON user_roles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (user_id = auth.uid());

-- Portfolio students policies
CREATE POLICY "Closers view own students" ON portfolio_students FOR SELECT USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'lider')
);
CREATE POLICY "Closers manage own students" ON portfolio_students FOR ALL USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- Student activities policies
CREATE POLICY "View student activities" ON student_activities FOR SELECT USING (
  student_id IN (SELECT id FROM portfolio_students WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);
CREATE POLICY "Manage student activities" ON student_activities FOR ALL USING (
  student_id IN (SELECT id FROM portfolio_students WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);

-- Ticket upgrades policies
CREATE POLICY "View ticket upgrades" ON ticket_upgrades FOR SELECT USING (
  student_id IN (SELECT id FROM portfolio_students WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Manage ticket upgrades" ON ticket_upgrades FOR ALL USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financeiro')
);

-- Indications policies
CREATE POLICY "Closers view own indications" ON indications FOR SELECT USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);
CREATE POLICY "Closers manage own indications" ON indications FOR ALL USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- CRM Automations policies
CREATE POLICY "View automations" ON crm_automations FOR SELECT USING (true);
CREATE POLICY "Admins manage automations" ON crm_automations FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Automation logs policies
CREATE POLICY "View automation logs" ON automation_logs FOR SELECT USING (
  has_role(auth.uid(), 'admin')
);

-- CRM Column settings policies
CREATE POLICY "Users manage own column settings" ON crm_column_settings FOR ALL USING (user_id = auth.uid());

-- Imported files policies
CREATE POLICY "Users view own imports" ON imported_files FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own imports" ON imported_files FOR ALL USING (user_id = auth.uid());

-- Import progress policies
CREATE POLICY "Users view own progress" ON import_progress FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own progress" ON import_progress FOR ALL USING (user_id = auth.uid());

-- User import sessions policies
CREATE POLICY "Users view own sessions" ON user_import_sessions FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Users manage own sessions" ON user_import_sessions FOR ALL USING (user_id = auth.uid());

-- System logs policies
CREATE POLICY "Admins view logs" ON system_logs FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System insert logs" ON system_logs FOR INSERT WITH CHECK (true);

-- API costs policies
CREATE POLICY "Admins view costs" ON api_costs FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System insert costs" ON api_costs FOR INSERT WITH CHECK (true);

-- API rate limits policies
CREATE POLICY "Users view own limits" ON api_rate_limits FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));
CREATE POLICY "System manage limits" ON api_rate_limits FOR ALL WITH CHECK (true);

-- Backups policies (admin only)
CREATE POLICY "Admins view call backups" ON calls_backup FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System insert call backups" ON calls_backup FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins view client backups" ON clients_backup FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System insert client backups" ON clients_backup FOR INSERT WITH CHECK (true);

-- Admin audit logs policies
CREATE POLICY "Admins view audit logs" ON admin_audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System insert audit logs" ON admin_audit_logs FOR INSERT WITH CHECK (true);

-- Daily verses policies (drop existing first to avoid conflicts)
DROP POLICY IF EXISTS "Anyone can view verses" ON daily_verses;
DROP POLICY IF EXISTS "Admins manage verses" ON daily_verses;
DROP POLICY IF EXISTS "daily_verses_select_policy" ON daily_verses;
DROP POLICY IF EXISTS "daily_verses_insert_policy" ON daily_verses;
DROP POLICY IF EXISTS "daily_verses_update_policy" ON daily_verses;
DROP POLICY IF EXISTS "daily_verses_delete_policy" ON daily_verses;
-- Drop any policy referencing user_id (common naming patterns)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'daily_verses' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON daily_verses', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Anyone can view verses" ON daily_verses FOR SELECT USING (true);
CREATE POLICY "Admins manage verses" ON daily_verses FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Intensive editions policies
CREATE POLICY "Anyone can view editions" ON intensive_editions FOR SELECT USING (true);
CREATE POLICY "Admins manage editions" ON intensive_editions FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Intensive leads policies
CREATE POLICY "Closers view own leads" ON intensive_leads FOR SELECT USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'lider')
);
CREATE POLICY "Closers manage own leads" ON intensive_leads FOR ALL USING (
  closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR has_role(auth.uid(), 'admin')
);

-- Intensive lead notes policies
CREATE POLICY "View lead notes" ON intensive_lead_notes FOR SELECT USING (true);
CREATE POLICY "Users insert lead notes" ON intensive_lead_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users delete own notes" ON intensive_lead_notes FOR DELETE USING (
  user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Client mentoria extra policies
CREATE POLICY "View mentoria extra" ON client_mentoria_extra FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);
CREATE POLICY "Manage mentoria extra" ON client_mentoria_extra FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);

-- Client intensivo participations policies
CREATE POLICY "View intensivo participations" ON client_intensivo_participations FOR SELECT USING (
  client_id IN (SELECT id FROM clients WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);
CREATE POLICY "Manage intensivo participations" ON client_intensivo_participations FOR ALL USING (
  client_id IN (SELECT id FROM clients WHERE closer_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  OR has_role(auth.uid(), 'admin')
);

-- ============================================================
-- PART 6: SEED DATA
-- ============================================================

-- Temporarily disable RLS on daily_verses for seed data insertion
ALTER TABLE daily_verses DISABLE ROW LEVEL SECURITY;

-- Insert company values as daily verses (8 values rotating)
INSERT INTO daily_verses (day_of_year, verse_text, reference) VALUES
  (1, 'Voce veio pra ser mais.', 'Bethel'),
  (2, 'Nosso proposito de vida e realizado com o trabalho.', 'Bethel'),
  (3, 'Nao nos pergunte se fomos capazes, nos de a missao.', 'Bethel'),
  (4, 'Nossa lideranca inspira confianca e acao.', 'Bethel'),
  (5, 'Superamos expectativas e alcancamos resultados acima da media.', 'Bethel'),
  (6, 'Sempre gratos, porem insatisfeitos!', 'Bethel'),
  (7, 'Assumimos a responsabilidade e agimos rapidamente para resolver qualquer desafio.', 'Bethel'),
  (8, 'Nosso ambiente e de frequencia elevada, inspirando alta performance e crescimento continuo.', 'Bethel')
ON CONFLICT (day_of_year) DO NOTHING;

-- Generate remaining days cycling through the 8 values
DO $$
DECLARE
  day_num INTEGER;
  verse_idx INTEGER;
  verses TEXT[] := ARRAY[
    'Voce veio pra ser mais.',
    'Nosso proposito de vida e realizado com o trabalho.',
    'Nao nos pergunte se fomos capazes, nos de a missao.',
    'Nossa lideranca inspira confianca e acao.',
    'Superamos expectativas e alcancamos resultados acima da media.',
    'Sempre gratos, porem insatisfeitos!',
    'Assumimos a responsabilidade e agimos rapidamente para resolver qualquer desafio.',
    'Nosso ambiente e de frequencia elevada, inspirando alta performance e crescimento continuo.'
  ];
BEGIN
  FOR day_num IN 9..366 LOOP
    verse_idx := ((day_num - 1) % 8) + 1;
    INSERT INTO daily_verses (day_of_year, verse_text, reference)
    VALUES (day_num, verses[verse_idx], 'Bethel')
    ON CONFLICT (day_of_year) DO NOTHING;
  END LOOP;
END $$;

-- Re-enable RLS on daily_verses after seed data insertion
ALTER TABLE daily_verses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- COMPLETE! Migration 011 finished.
-- ============================================================
