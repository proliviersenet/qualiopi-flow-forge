-- Chantier "sous-traitance" — durcissement (28/08, suite à relecture). Les policies
-- "Sous-traitant gere les documents de sa session" et "Sous-traitant gere les
-- signatures de sa session" posées dans 20260828132633_sous_traitance_sessions.sql
-- donnaient un accès FOR ALL sans distinction de type de document : en pratique
-- l'interface (SessionSousTraitee.tsx) ne propose jamais au sous-traitant de
-- toucher au devis ou à la convention (documents commerciaux entre le formateur qui
-- a vendu la formation et son client), mais rien côté base ne l'empêchait d'y
-- accéder en appelant directement l'API Supabase. On resserre ici l'accès du
-- sous-traitant aux seuls documents qu'il est censé animer : livret d'accueil et
-- émargement. Remplace les 2 policies concernées (DROP + CREATE, même nom, aucune
-- autre policy touchée) — strictement plus restrictif qu'avant, aucun changement de
-- comportement pour qui que ce soit d'autre (formateur, client, superadmin).

drop policy if exists "Sous-traitant gere les documents de sa session" on public.documents_formation;
create policy "Sous-traitant gere les documents de sa session"
  on public.documents_formation
  for all
  to authenticated
  using (
    session_id is not null
    and type in ('livret', 'emargement')
    and exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = documents_formation.session_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  )
  with check (
    session_id is not null
    and type in ('livret', 'emargement')
    and exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = documents_formation.session_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );

drop policy if exists "Sous-traitant gere les signatures de sa session" on public.signatures;
create policy "Sous-traitant gere les signatures de sa session"
  on public.signatures
  for all
  to authenticated
  using (
    exists (
      select 1 from public.documents_formation df
      join public.sessions_sous_traitance st on st.session_id = df.session_id
      where df.id = signatures.document_id
        and df.type in ('livret', 'emargement')
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents_formation df
      join public.sessions_sous_traitance st on st.session_id = df.session_id
      where df.id = signatures.document_id
        and df.type in ('livret', 'emargement')
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );
