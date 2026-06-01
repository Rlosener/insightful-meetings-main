create extension if not exists "pgcrypto";

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  full_name text not null,
  email text,
  phone text,
  job_title text not null,
  department text,
  experience_years text,
  education text,
  job_description text,
  cv_text text not null,
  notes text,
  status text not null default 'Hazırlık',
  source text not null default 'Manuel CRM',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidates_user_created_idx
  on public.candidates (user_id, created_at desc);

alter table public.candidates enable row level security;

drop policy if exists "Users can view own candidates" on public.candidates;
drop policy if exists "Users can create own candidates" on public.candidates;
drop policy if exists "Users can update own candidates" on public.candidates;
drop policy if exists "Users can delete own candidates" on public.candidates;

create policy "Users can view own candidates"
  on public.candidates for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create own candidates"
  on public.candidates for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own candidates"
  on public.candidates for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own candidates"
  on public.candidates for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.candidates to authenticated;

drop trigger if exists update_candidates_updated_at on public.candidates;
create trigger update_candidates_updated_at
  before update on public.candidates
  for each row execute function public.update_updated_at_column();
