
-- Custom interview questions saved by companies
CREATE TABLE public.custom_interview_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Genel',
  question_type TEXT NOT NULL DEFAULT 'behavioral',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  template_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Question templates / sets
CREATE TABLE public.interview_question_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  position TEXT,
  department TEXT,
  difficulty TEXT DEFAULT 'medium',
  interview_style TEXT DEFAULT 'formal',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key from questions to templates
ALTER TABLE public.custom_interview_questions
  ADD CONSTRAINT custom_interview_questions_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.interview_question_templates(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.custom_interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_question_templates ENABLE ROW LEVEL SECURITY;

-- RLS for custom_interview_questions
CREATE POLICY "Users can view own questions" ON public.custom_interview_questions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own questions" ON public.custom_interview_questions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own questions" ON public.custom_interview_questions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own questions" ON public.custom_interview_questions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS for interview_question_templates
CREATE POLICY "Users can view own templates" ON public.interview_question_templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own templates" ON public.interview_question_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON public.interview_question_templates FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON public.interview_question_templates FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_custom_interview_questions_updated_at
  BEFORE UPDATE ON public.custom_interview_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_interview_question_templates_updated_at
  BEFORE UPDATE ON public.interview_question_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
