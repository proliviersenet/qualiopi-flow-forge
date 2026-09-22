-- 1) RLS policy fix : veille_qualiopi_log ne doit plus dépendre de auth.jwt() user_metadata
--    (modifiable par le client) mais de profiles.role (colonne serveur, cohérente avec le
--    reste du schéma).
drop policy if exists "Formateurs can view veille qualiopi log" on public.veille_qualiopi_log;
create policy "Formateurs can view veille qualiopi log"
  on public.veille_qualiopi_log
  for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role is distinct from 'client'
    )
  );

-- 2) search_path mutable sur 6 fonctions (faille classique de détournement de schéma)
alter function public.handle_new_user() set search_path to 'public';
alter function public.generer_relances_session(uuid) set search_path to 'public';
alter function public.trigger_generer_relances() set search_path to 'public';
alter function public.forcer_cloture_session(uuid, uuid, text) set search_path to 'public';
alter function public.find_user_by_email(text) set search_path to 'public';
alter function public.get_user_id_by_email(text) set search_path to 'public';

-- 3a) Fonctions déclencheurs pures : jamais destinées à être appelées directement
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.trigger_generer_relances() from public, anon, authenticated;
revoke all on function public.fn_journaliser_modification() from public, anon, authenticated;

-- 3b) Non utilisées par le code client (appelées uniquement côté serveur avec la clé
--     service_role, ou destinées à un usage manuel via l'éditeur SQL) : on retire
--     l'exposition publique via l'API REST.
revoke all on function public.find_user_by_email(text) from public, anon, authenticated;
revoke all on function public.forcer_cloture_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.generer_relances_session(uuid) from public, anon, authenticated;
revoke all on function public.get_user_id_by_email(text) from public, anon, authenticated;

-- 3c) Utilisées à l'intérieur de règles RLS pour des utilisateurs connectés
--     (sous-traitance, documents Qualiopi) : on garde authenticated, on retire anon.
revoke all on function public.client_id_sous_traite_actif(uuid) from public, anon;
grant execute on function public.client_id_sous_traite_actif(uuid) to authenticated;
revoke all on function public.formation_id_sous_traitee_active(uuid) from public, anon;
grant execute on function public.formation_id_sous_traitee_active(uuid) to authenticated;
revoke all on function public.documents_qualiopi_owned(text) from public, anon;
grant execute on function public.documents_qualiopi_owned(text) to authenticated;

-- 3d) Parité avec la production (déjà correct côté prod pour ces deux fonctions).
revoke all on function public.hash_password_for_history(text) from public, anon, authenticated;
revoke all on function public.password_matches_hash(text, text) from public, anon, authenticated;
