
CREATE TABLE public.tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  series_type text NOT NULL CHECK (series_type IN ('3','5')),
  total_matches integer NOT NULL,
  maps text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own tournaments" ON public.tournaments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.matches
  ADD COLUMN tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  ADD COLUMN match_number integer,
  ADD COLUMN map_name text;

CREATE INDEX matches_tournament_id_idx ON public.matches(tournament_id);
