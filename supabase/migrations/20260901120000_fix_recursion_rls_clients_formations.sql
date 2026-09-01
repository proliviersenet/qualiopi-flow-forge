-- Correctif URGENT (01/09) — bug de fond du chantier "sous-traitance" (28/08).
--
-- Symptôme observé en prod : "Mes clients" et "Mes formations" affichent "Aucun..."
-- pour TOUS les formateurs, alors que les données existent bien en base (vérifié
-- via l'explorateur superadmin, qui passe en service role et voit tout). En
-- reproduisant la session du formateur, Postgres renvoie :
--   ERROR: 42P17: infinite recursion detected in policy for relation "sessions"
--
-- Cause : les policies "Sous-traitant voit le client de sa session" (sur
-- clients) et "Sous-traitant voit la formation de sa session" (sur formations)
-- lisent la table sessions dans leur propre condition (join sessions s on
-- s.id = st.session_id). Or la table sessions a sa propre policy (préexistante,
-- hors de ce chantier) qui vérifie la propriété du client/de la formation pour
-- autoriser le formateur propriétaire — donc évaluer la policy de clients force
-- à évaluer la policy de sessions, qui force à évaluer la policy de clients...
-- boucle infinie. Résultat : Postgres abandonne avec une erreur 500, et le code
-- frontend (qui ne vérifie pas l'erreur sur ces deux appels precis) affiche
-- silencieusement "Aucun client" / "Aucune formation" comme si tout avait été
-- supprimé — alors que rien n'a jamais été touché.
--
-- Correctif : sortir la lecture croisée sessions_sous_traitance + sessions dans
-- deux fonctions SECURITY DEFINER dédiées. Une fonction SECURITY DEFINER
-- s'exécute avec les droits de son propriétaire (qui contourne RLS), donc ses
-- requêtes internes sur sessions_sous_traitance/sessions ne redéclenchent pas la
-- policy de sessions — la boucle est cassée. Le résultat et le périmètre
-- d'accès du sous-traitant restent strictement identiques à avant : il continue
-- de voir exactement le client et la formation de la session qui lui a été
-- confiée, ni plus ni moins.

create or replace function public.client_id_sous_traite_actif(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.sessions_sous_traitance st
    join public.sessions s on s.id = st.session_id
    where s.client_id = p_client_id
      and st.statut = 'actif'
      and st.profile_sous_traitant_id = auth.uid()
  )
$$;

create or replace function public.formation_id_sous_traitee_active(p_formation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.sessions_sous_traitance st
    join public.sessions s on s.id = st.session_id
    where s.formation_id = p_formation_id
      and st.statut = 'actif'
      and st.profile_sous_traitant_id = auth.uid()
  )
$$;

revoke all on function public.client_id_sous_traite_actif(uuid) from public;
grant execute on function public.client_id_sous_traite_actif(uuid) to authenticated;
revoke all on function public.formation_id_sous_traitee_active(uuid) from public;
grant execute on function public.formation_id_sous_traitee_active(uuid) to authenticated;

drop policy if exists "Sous-traitant voit le client de sa session" on public.clients;
create policy "Sous-traitant voit le client de sa session"
  on public.clients
  for select
  to authenticated
  using ( public.client_id_sous_traite_actif(clients.id) );

drop policy if exists "Sous-traitant voit la formation de sa session" on public.formations;
create policy "Sous-traitant voit la formation de sa session"
  on public.formations
  for select
  to authenticated
  using ( public.formation_id_sous_traitee_active(formations.id) );
