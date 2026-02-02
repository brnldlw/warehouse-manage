# Database Setup Instructions

## Supabase Configuration

### 1. Create Supabase Project
1. Go to https://supabase.com
2. Create new project
3. Copy Project URL and API Key
4. Update `src/lib/supabase.ts` with your credentials

### 2. Database Schema
Run these SQL commands in Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'tech' CHECK (role IN ('admin', 'tech')),
  company TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create inventory table
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  barcode TEXT UNIQUE,
  category TEXT,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  location TEXT,
  price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create requests table
CREATE TABLE requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tech_id UUID REFERENCES profiles(id),
  item_id UUID REFERENCES inventory(id),
  quantity INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create trucks table
CREATE TABLE trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_plate TEXT,
  assigned_tech UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Row Level Security Policies
```sql
-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Inventory policies
CREATE POLICY "All users can view inventory" ON inventory FOR SELECT TO authenticated;
CREATE POLICY "Admins can manage inventory" ON inventory FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Requests policies
CREATE POLICY "Techs can view own requests" ON requests FOR SELECT USING (tech_id = auth.uid());
CREATE POLICY "Techs can create requests" ON requests FOR INSERT WITH CHECK (tech_id = auth.uid());
CREATE POLICY "Admins can view all requests" ON requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### 4. Storage Setup
1. Create bucket: `inventory-images`
2. Set public access for product images
3. Configure upload policies for authenticated users