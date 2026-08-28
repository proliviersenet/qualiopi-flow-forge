-- Chantier "sous-traitance" (28/08) : un formateur qui a vendu une formation à un
-- client peut sous-traiter l'ANIMATION d'une session précise à un autre formateur,
-- indépendant, avec son propre organisme/NDA. Les deux organismes doivent pouvoir
-- retrouver la session dans leur espace (BPF, audit Qualiopi).
--
-- Conçu pour être 100% additif : aucune policy existante n'est modifiée ou supprimée
-- (RLS Postgres est permissif par défaut, les nouvelles policies s'ajoutent en OR aux
-- policies déjà en place). Toutes les écritures sur sessions_sous_traitance passent par
-- des Edge Functions (service role) — les seules policies côté client sont en lecture
-- (+ une policy de mise à jour restreinte pour "retirer" un sous-traitant).

create table if not exists public.sessions_sous_traitance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  organisme_demandeur_id uuid not null references public.organismes(id) on delete cascade,
  organisme_sous_traitant_id uuid references public.organismes(id) on delete cascade,
  profile_sous_traitant_id uuid references public.profiles(id) on delete cascade,
  email_invite text,
  statut text not null default 'invite' check (statut in ('invite', 'actif', 'retire')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sessions_sous_traitance is
  'Sous-traitance de l''animation d''une session à un formateur externe (organisme distinct). '
  'statut=invite : email envoyé, compte pas encore créé ou pas encore rattaché. '
  'statut=actif : le sous-traitant a un accès complet à la session (lecture + animation). '
  'statut=retire : accès révoqué, ligne conservée pour historique/traçabilité.';

-- Une seule sous-traitance "vivante" (invite ou actif) à la fois par session — V1 : pas
-- de sous-traitance en cascade ni de double assignation. Les lignes "retire" ne comptent
-- pas dans cette contrainte, pour permettre de réassigner après un retrait.
create unique index if not exists sessions_sous_traitance_session_vivante_uniq
  on public.sessions_sous_traitance (session_id)
  where statut in ('invite', 'actif');

create index if not exists sessions_sous_traitance_profile_idx
  on public.sessions_sous_traitance (profile_sous_traitant_id);
create index if not exists sessions_sous_traitance_organisme_demandeur_idx
  on public.sessions_sous_traitance (organisme_demandeur_id);
create index if not exists sessions_sous_traitance_token_idx
  on public.sessions_sous_traitance (token);

alter table public.sessions_sous_traitance enable row level security;

-- Lecture : l'organisme qui sous-traite (pour afficher le badge "sous-traité à X" et
-- gérer le retrait) + le formateur sous-traitant lui-même (pour retrouver ses sessions).
drop policy if exists "Voir ses sous-traitances" on public.sessions_sous_traitance;
create policy "Voir ses sous-traitances"
  on public.sessions_sous_traitance
  for select
  to authenticated
  using (
    organisme_demandeur_id = (select p.organisme_id from public.profiles p where p.id = auth.uid())
    or profile_sous_traitant_id = auth.uid()
  );

-- Mise à jour : réservée à l'organisme demandeur, pour le bouton "Retirer le
-- sous-traitant" (passage statut -> 'retire'). Toute autre écriture (création,
-- rattachement du compte sous-traitant) passe par les Edge Functions en service role.
drop policy if exists "Retirer son propre sous-traitant" on public.sessions_sous_traitance;
create policy "Retirer son propre sous-traitant"
  on public.sessions_sous_traitance
  for update
  to authenticated
  using (organisme_demandeur_id = (select p.organisme_id from public.profiles p where p.id = auth.uid()))
  with check (organisme_demandeur_id = (select p.organisme_id from public.profiles p where p.id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Accès du sous-traitant aux données de LA session qui lui est confiée (et
-- seulement celle-ci) : lecture/écriture équivalente à un formateur normal sur ce
-- périmètre précis, pour pouvoir réellement l'animer (émargement, questionnaires,
-- attestation, ajout/retrait de stagiaires).
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Sous-traitant voit sa session" on public.sessions;
create policy "Sous-traitant voit sa session"
  on public.sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = sessions.id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );

drop policy if exists "Sous-traitant voit la formation de sa session" on public.formations;
create policy "Sous-traitant voit la formation de sa session"
  on public.formations
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions_sous_traitance st
      join public.sessions s on s.id = st.session_id
      where s.formation_id = formations.id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );

drop policy if exists "Sous-traitant voit le client de sa session" on public.clients;
create policy "Sous-traitant voit le client de sa session"
  on public.clients
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions_sous_traitance st
      join public.sessions s on s.id = st.session_id
      where s.client_id = clients.id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );

drop policy if exists "Sous-traitant gere les stagiaires de sa session" on public.stagiaires;
create policy "Sous-traitant gere les stagiaires de sa session"
  on public.stagiaires
  for all
  to authenticated
  using (
    exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = stagiaires.session_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = stagiaires.session_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );

drop policy if exists "Sous-traitant gere les documents de sa session" on public.documents_formation;
create policy "Sous-traitant gere les documents de sa session"
  on public.documents_formation
  for all
  to authenticated
  using (
    session_id is not null
    and exists (
      select 1 from public.sessions_sous_traitance st
      where st.session_id = documents_formation.session_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  )
  with check (
    session_id is not null
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
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.documents_formation df
      join public.sessions_sous_traitance st on st.session_id = df.session_id
      where df.id = signatures.document_id
        and st.statut = 'actif'
        and st.profile_sous_traitant_id = auth.uid()
    )
  );
