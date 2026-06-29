ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS players text[] NOT NULL DEFAULT '{}';