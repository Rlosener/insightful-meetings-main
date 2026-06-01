
CREATE TABLE public.daily_training (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  training_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_task TEXT,
  questions JSONB DEFAULT '[]'::jsonb,
  answers JSONB DEFAULT '[]'::jsonb,
  feedback JSONB,
  score INTEGER,
  completed BOOLEAN NOT NULL DEFAULT false,
  streak_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, training_date)
);

ALTER TABLE public.daily_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily training" ON public.daily_training FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own daily training" ON public.daily_training FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily training" ON public.daily_training FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily training" ON public.daily_training FOR DELETE TO authenticated USING (auth.uid() = user_id);
