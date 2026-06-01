CREATE TABLE public.processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recording_id uuid REFERENCES public.recordings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'uploaded',
  pipeline_step text DEFAULT 'upload',
  progress integer DEFAULT 0,
  file_path text,
  file_name text NOT NULL,
  file_size bigint,
  source_type text DEFAULT 'upload_video',
  recording_type text DEFAULT 'toplantı',
  title text NOT NULL,
  behavioral_analysis boolean DEFAULT false,
  failure_reason text,
  failed_step text,
  error_type text,
  retry_count integer DEFAULT 0,
  transcript_length integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" ON public.processing_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own jobs" ON public.processing_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own jobs" ON public.processing_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own jobs" ON public.processing_jobs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.processing_jobs;