-- Correction de la policy RLS de veille_qualiopi_log.
-- Le rôle "formateur" n'est pas stocké explicitement dans user_metadata : seuls les
-- comptes clients ont un champ role = 'client' explicite (les comptes formateurs n'ont
-- pas de champ role du tout). La policy initiale (role = 'formateur') excluait donc à
-- tort les vrais comptes formateurs. On aligne la condition sur la convention déjà
-- utilisée côté frontend (role !== 'client'), null-safe grâce à IS DISTINCT FROM.

drop policy if exists "Formateurs can view veille qualiopi log" on public.veille_qualiopi_log;

create policy "Formateurs can view veille qualiopi log"
  on public.veille_qualiopi_log
  for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') is distinct from 'client');
