-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Community tournaments
CREATE TABLE public.community_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  game_title text NOT NULL,
  start_at timestamptz NOT NULL,
  prize_pool text,
  entry_fee text,
  rules text,
  whatsapp text NOT NULL,
  slots_total integer NOT NULL DEFAULT 12,
  slots_taken integer NOT NULL DEFAULT 0,
  slot_list text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_tournaments TO authenticated;
GRANT ALL ON public.community_tournaments TO service_role;

ALTER TABLE public.community_tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone signed in reads approved listings" ON public.community_tournaments
  FOR SELECT TO authenticated USING (status = 'approved');

CREATE POLICY "organizers read own listings" ON public.community_tournaments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admins read all listings" ON public.community_tournaments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "organizers submit listings" ON public.community_tournaments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "organizers update own listings" ON public.community_tournaments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "organizers delete own listings" ON public.community_tournaments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "admins update listings" ON public.community_tournaments
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins delete listings" ON public.community_tournaments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_community_tournaments_updated_at
  BEFORE UPDATE ON public.community_tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();