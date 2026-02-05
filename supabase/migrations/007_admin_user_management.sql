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
