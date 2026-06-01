
CREATE TABLE public.career_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text,
  target_role text,
  linkedin_url text,
  summary text,
  education jsonb DEFAULT '[]'::jsonb,
  experience jsonb DEFAULT '[]'::jsonb,
  skills text[] DEFAULT '{}'::text[],
  certifications jsonb DEFAULT '[]'::jsonb,
  projects jsonb DEFAULT '[]'::jsonb,
  events_trainings jsonb DEFAULT '[]'::jsonb,
  ai_insights jsonb,
  career_readiness_score integer,
  ai_insights_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.career_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own career profile" ON public.career_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own career profile" ON public.career_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own career profile" ON public.career_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own career profile" ON public.career_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_career_profiles_updated_at BEFORE UPDATE ON public.career_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
