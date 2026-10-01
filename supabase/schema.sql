-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- One row per signed-in person, holding all their profiles, clients and proposals.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Row level security on with no policies: browsers can't read or write this table directly.
-- Only the QuickPitch server (using the service role key) can, after checking who is logged in.
alter table public.user_data enable row level security;
