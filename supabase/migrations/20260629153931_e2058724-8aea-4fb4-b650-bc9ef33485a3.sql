
-- Teams (permanent across user)
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  logo_url text,
  aliases text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teams_user_idx ON public.teams(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own teams" ON public.teams FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now(),
  screenshot_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matches_user_idx ON public.matches(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own matches" ON public.matches FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Match results (per team per match)
CREATE TABLE public.match_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  team_name_raw text NOT NULL,
  placement int NOT NULL,
  kills int NOT NULL DEFAULT 0,
  placement_points int NOT NULL DEFAULT 0,
  kill_points int NOT NULL DEFAULT 0,
  total_points int NOT NULL DEFAULT 0,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mr_user_idx ON public.match_results(user_id);
CREATE INDEX mr_match_idx ON public.match_results(match_id);
CREATE INDEX mr_team_idx ON public.match_results(team_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.match_results TO authenticated;
GRANT ALL ON public.match_results TO service_role;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own results" ON public.match_results FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Per-user settings (placement scoring table)
CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  placement_points jsonb NOT NULL DEFAULT '{"1":12,"2":9,"3":8,"4":7,"5":6,"6":5,"7":4,"8":3,"9":2,"10":1,"11":0,"12":0}'::jsonb,
  kill_point_value int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage policies
CREATE POLICY "team logos public read" ON storage.objects FOR SELECT USING (bucket_id = 'team-logos');
CREATE POLICY "team logos auth write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'team-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "team logos auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'team-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "team logos auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'team-logos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "screenshots owner read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'match-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "screenshots owner write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'match-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "screenshots owner delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'match-screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
