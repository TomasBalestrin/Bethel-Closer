-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'closer', 'lider');
CREATE TYPE client_status AS ENUM ('lead', 'contacted', 'negotiating', 'closed_won', 'closed_lost');
CREATE TYPE client_source AS ENUM ('organic', 'referral', 'ads', 'event', 'other');
CREATE TYPE ticket_type AS ENUM ('29_90', '12k', '80k');
CREATE TYPE call_status AS ENUM ('scheduled', 'completed', 'no_show', 'rescheduled', 'cancelled');
CREATE TYPE call_classification AS ENUM ('hot', 'warm', 'cold', 'not_qualified');
CREATE TYPE activity_type AS ENUM ('call', 'email', 'meeting', 'note', 'status_change');

-- Profiles table
CREATE TABLE profiles (
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

-- Clients table
CREATE TABLE clients (
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
CREATE TABLE calls (
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
CREATE TABLE client_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    type activity_type NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Client notes table
CREATE TABLE client_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tags table
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(7) DEFAULT '#6366f1' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Client tags junction table
CREATE TABLE client_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(client_id, tag_id)
);

-- Monthly goals table
CREATE TABLE monthly_goals (
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

-- Create indexes for better performance
CREATE INDEX idx_clients_closer_id ON clients(closer_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_created_at ON clients(created_at);
CREATE INDEX idx_calls_client_id ON calls(client_id);
CREATE INDEX idx_calls_closer_id ON calls(closer_id);
CREATE INDEX idx_calls_scheduled_at ON calls(scheduled_at);
CREATE INDEX idx_calls_status ON calls(status);
CREATE INDEX idx_client_activities_client_id ON client_activities(client_id);
CREATE INDEX idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX idx_monthly_goals_closer_id ON monthly_goals(closer_id);
CREATE INDEX idx_monthly_goals_month ON monthly_goals(month);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_notes_updated_at BEFORE UPDATE ON client_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
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
