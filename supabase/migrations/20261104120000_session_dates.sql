-- Correctif du 04/11/2026 (demande Olivier : "pour les dates, vas-y fonce sans
-- rien casser" — besoin de positionner une formation sur plusieurs dates/demi-
-- journées non consécutives au lieu d'une seule plage date_debut/date_fin).
--
-- Table ADDITIVE : sessions.date_debut et sessions.date_fin restent en place et
-- continuent d'être renseignés (min/max des dates choisies) pour ne rien casser
-- de l'existant (automatisations de relance par fenêtre J-7..J, dashboards,
-- tris, alerte-avant-formation, etc., qui lisent tous directement ces deux
-- colonnes). Quand une session a des lignes ici, generer-emargement les utilise
-- à la place du calendrier continu ; sinon il retombe sur le comportement
-- historique (une feuille par jour calendaire entre date_debut et date_fin).
create table if not exists public.session_dates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  date date not null,
  creneau text not null default 'journee' check (creneau in ('journee', 'matin', 'apres_midi')),
  created_at timestamptz not null default now(),
  unique (session_id, date, creneau)
);
 
create index if not exists idx_session_dates_session_id on public.session_dates(session_id);
 
alter table public.session_dates enable row level security;
 
-- Mêmes règles d'accès que sur sessions elle-même (formateur de l'organisme
-- propriétaire via sessions -> formations -> organisme_id, ou client affecté) :
-- on délègue la visibilité à une sous-requête sur sessions pour rester
-- cohérent avec le modèle de droits existant, sans dupliquer sa logique.
create policy "session_dates_select_formateur" on public.session_dates
  for select
  using (
    exists (
      select 1 from public.sessions s
      join public.formations f on f.id = s.formation_id
      join public.profiles p on p.organisme_id = f.organisme_id
      where s.id = session_dates.session_id and p.id = auth.uid()
    )
  );
 
create policy "session_dates_select_client" on public.session_dates
  for select
  using (
    exists (
      select 1 from public.sessions s
      join public.clients c on c.id = s.client_id
      where s.id = session_dates.session_id and c.contact_email = auth.jwt() ->> 'email'
    )
  );
 
create policy "session_dates_all_service_role" on public.session_dates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
 
create policy "session_dates_insert_formateur" on public.session_dates
  for insert
  with check (
    exists (
      select 1 from public.sessions s
      join public.formations f on f.id = s.formation_id
      join public.profiles p on p.organisme_id = f.organisme_id
      where s.id = session_dates.session_id and p.id = auth.uid()
    )
  );
 
create policy "session_dates_delete_formateur" on public.session_dates
  for delete
  using (
    exists (
      select 1 from public.sessions s
      join public.formations f on f.id = s.formation_id
      join public.profiles p on p.organisme_id = f.organisme_id
      where s.id = session_dates.session_id and p.id = auth.uid()
    )
  );
 
