-- Correctif du 06/11/2026 (suite directe de la migration précédente
-- 20261106140000_journal_audit_flux_qualiopi.sql) : la table
-- journal_modifications a RLS activé mais n'avait AUCUNE policy définie —
-- en PostgreSQL, "RLS activé + zéro policy" veut dire "aucun accès du tout"
-- pour les rôles authenticated/anon (seul le service_role, qui contourne RLS,
-- pouvait la lire). La nouvelle page "Preuve d'audit Qualiopi" a besoin de
-- lire cette table depuis le navigateur du formateur (et du client) pour
-- retrouver la date exacte de certains évènements qui n'ont pas de colonne
-- de date dédiée (relances/alertes automatiques, complétion d'un
-- questionnaire) — sans cette policy, la page affichait "date non tracée"
-- pour TOUT, même quand le journal avait bien l'information.
--
-- Cette policy est additive et read-only (SELECT uniquement) : elle ne
-- change aucun comportement existant, elle ouvre juste la lecture, et
-- uniquement pour les deux table_source dont la nouvelle page a besoin
-- (stagiaires, signatures), avec exactement les mêmes règles d'accès que
-- celles déjà en place sur les tables stagiaires et signatures elles-mêmes
-- (formateur de l'organisme propriétaire, client affecté à la session via
-- son email, ou sous-traitant actif sur la session) — un utilisateur ne peut
-- donc voir dans le journal que ce qu'il pourrait déjà voir directement en
-- consultant stagiaires/signatures aujourd'hui.
create policy "journal_modifications_select_stagiaires_signatures" on public.journal_modifications
for select
using (
  (table_source = 'stagiaires' and exists (
    select 1 from public.stagiaires st
    join public.sessions se on se.id = st.session_id
    join public.formations f on f.id = se.formation_id
    join public.profiles p on p.organisme_id = f.organisme_id
    where st.id = journal_modifications.enregistrement_id and p.id = auth.uid()
  ))
  or (table_source = 'stagiaires' and exists (
    select 1 from public.stagiaires st
    join public.sessions se on se.id = st.session_id
    join public.clients c on c.id = se.client_id
    where st.id = journal_modifications.enregistrement_id and c.contact_email = auth.email()
  ))
  or (table_source = 'stagiaires' and exists (
    select 1 from public.stagiaires st
    join public.sessions_sous_traitance sst on sst.session_id = st.session_id
    where st.id = journal_modifications.enregistrement_id
      and sst.statut = 'actif' and sst.profile_sous_traitant_id = auth.uid()
  ))
  or (table_source = 'signatures' and exists (
    select 1 from public.signatures sig
    join public.documents_formation df on df.id = sig.document_id
    join public.formations f on f.id = df.formation_id
    join public.profiles p on p.organisme_id = f.organisme_id
    where sig.id = journal_modifications.enregistrement_id and p.id = auth.uid()
  ))
  or (table_source = 'signatures' and exists (
    select 1 from public.signatures sig
    join public.documents_formation df on df.id = sig.document_id
    join public.formations f on f.id = df.formation_id
    join public.organismes o on o.id = f.organisme_id
    where sig.id = journal_modifications.enregistrement_id and o.owner_user_id = auth.uid()
  ))
  or (table_source = 'signatures' and exists (
    select 1 from public.signatures sig
    join public.documents_formation df on df.id = sig.document_id
    join public.sessions se on se.id = df.session_id
    join public.clients c on c.id = se.client_id
    where sig.id = journal_modifications.enregistrement_id and c.contact_email = auth.email()
  ))
  or (table_source = 'signatures' and exists (
    select 1 from public.signatures sig
    join public.documents_formation df on df.id = sig.document_id
    join public.sessions_sous_traitance sst on sst.session_id = df.session_id
    where sig.id = journal_modifications.enregistrement_id
      and df.type = any (array['livret','emargement'])
      and sst.statut = 'actif' and sst.profile_sous_traitant_id = auth.uid()
  ))
);
 
