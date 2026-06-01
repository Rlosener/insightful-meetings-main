
-- Create action_items table for structured action item tracking
CREATE TABLE public.action_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL REFERENCES public.recordings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  task_description TEXT NOT NULL,
  owner TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'incomplete',
  ai_suggestion TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own action items"
ON public.action_items FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own action items"
ON public.action_items FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own action items"
ON public.action_items FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own action items"
ON public.action_items FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_action_items_updated_at
BEFORE UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups by recording
CREATE INDEX idx_action_items_recording_id ON public.action_items(recording_id);
CREATE INDEX idx_action_items_user_id ON public.action_items(user_id);
