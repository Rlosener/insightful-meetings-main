
-- Company Profiles table
CREATE TABLE public.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text,
  sector text,
  sub_sector text,
  products_services text[] DEFAULT '{}',
  import_structure text,
  export_structure text,
  target_markets text[] DEFAULT '{}',
  operation_cities text[] DEFAULT '{}',
  critical_cost_items text[] DEFAULT '{}',
  strategic_risks text[] DEFAULT '{}',
  supply_dependencies text[] DEFAULT '{}',
  operation_type text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company profile" ON public.company_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own company profile" ON public.company_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own company profile" ON public.company_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own company profile" ON public.company_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Sector Developments table
CREATE TABLE public.sector_developments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  source text,
  development_date date DEFAULT CURRENT_DATE,
  risk_level text DEFAULT 'medium',
  opportunity_level text DEFAULT 'medium',
  cost_impact text,
  sales_impact text,
  margin_impact text,
  supply_impact text,
  market_impact text,
  ai_commentary text,
  recommended_action text,
  relevance_score integer,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.sector_developments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sector developments" ON public.sector_developments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sector developments" ON public.sector_developments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sector developments" ON public.sector_developments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sector developments" ON public.sector_developments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Advisor History table
CREATE TABLE public.advisor_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer jsonb,
  sources_used text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.advisor_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own advisor history" ON public.advisor_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own advisor history" ON public.advisor_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own advisor history" ON public.advisor_history FOR DELETE TO authenticated USING (auth.uid() = user_id);
