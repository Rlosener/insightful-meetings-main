
-- Company members table
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  position text,
  department text,
  email text,
  phone text,
  skills text[] DEFAULT '{}',
  notes text,
  ai_analysis jsonb,
  ai_analysis_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company members"
  ON public.company_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own company members"
  ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company members"
  ON public.company_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own company members"
  ON public.company_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_company_members_updated_at
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Member meeting insights - stores per-member insights from each meeting
CREATE TABLE public.member_meeting_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  member_id uuid NOT NULL REFERENCES public.company_members(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  contribution_score integer,
  communication_style text,
  behavioral_insights text,
  strengths text[] DEFAULT '{}',
  areas_for_improvement text[] DEFAULT '{}',
  mood text,
  confidence_level text,
  engagement_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, recording_id)
);

ALTER TABLE public.member_meeting_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own member insights"
  ON public.member_meeting_insights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own member insights"
  ON public.member_meeting_insights FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own member insights"
  ON public.member_meeting_insights FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own member insights"
  ON public.member_meeting_insights FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
