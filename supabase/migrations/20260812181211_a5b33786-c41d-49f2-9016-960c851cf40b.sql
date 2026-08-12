create schema if not exists private;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

revoke all on function private.has_role(uuid, public.app_role) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;

drop policy if exists "admins read all listings" on public.community_tournaments;
create policy "admins read all listings" on public.community_tournaments
  for select to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins update listings" on public.community_tournaments;
create policy "admins update listings" on public.community_tournaments
  for update to authenticated using (private.has_role(auth.uid(), 'admin'))
  with check (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins delete listings" on public.community_tournaments;
create policy "admins delete listings" on public.community_tournaments
  for delete to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins read audit logs" on public.admin_audit_logs;
create policy "admins read audit logs" on public.admin_audit_logs
  for select to authenticated using (private.has_role(auth.uid(), 'admin'));

drop policy if exists "admins write audit logs" on public.admin_audit_logs;
create policy "admins write audit logs" on public.admin_audit_logs
  for insert to authenticated with check (private.has_role(auth.uid(), 'admin') and admin_id = auth.uid());

drop function if exists public.has_role(uuid, public.app_role);

drop policy if exists "own screenshots update" on storage.objects;
create policy "own screenshots update" on storage.objects
  for update to authenticated
  using (bucket_id = 'match-screenshots' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'match-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);