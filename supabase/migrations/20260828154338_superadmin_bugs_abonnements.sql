-- Chantier "superadmin" (28/08) : accès SAV transverse pour Olivier + TdB avec
-- KPI plateforme + flux d'alertes bug. Migration strictement additive (aucune
-- table/policy existante n'est modifiée), dans le même esprit que la migration
-- sous-traitance : tout l'accès transverse passe par des Edge Functions
-- service-role gated ADMIN_EMAIL (voir lister-demandes-suppression pour le
-- pattern déjà en place), donc ces nouvelles tables n'ont volontairement AUCUNE
-- policy authenticated en lecture/écriture générale — seule l'insertion de son
-- propre signalement de bug est ouverte.

-- =========================================================================
-- 1. Table bugs : alimentée soit automatiquement (ErrorBoundary React, crash
--    JS), soit manuellement (bouton "Signaler un bug" visible formateur+client).
-- =========================================================================
create table if not exists public.bugs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('auto', 'manuel')),
  type text not null default 'non_precise',
  message text not null,
  stack text,
  page_url text,
  user_id uuid,
  user_email text,
  organisme_id uuid references public.organismes(id) on delete set null,
  role text,
  contexte jsonb,
  statut text not null default 'nouveau' check (statut in ('nouveau', 'en_cours', 'resolu')),
  created_at timestamptz not null default now(),
  resolu_le timestamptz,
  resolu_par uuid
);

create index if not exists idx_bugs_statut on public.bugs(statut);
create index if not exists idx_bugs_created_at on public.bugs(created_at desc);

alter table public.bugs enable row level security;

-- Seule policy authenticated : chacun peut signaler un bug pour lui-même (ou
-- sans user_id si l'info n'est pas dispo au moment du crash). Pas de SELECT
-- authenticated : la liste et la résolution passent uniquement par la fonction
-- superadmin-bugs (service role, gated ADMIN_EMAIL).
drop policy if exists "Signaler un bug" on public.bugs;
create policy "Signaler un bug"
  on public.bugs for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- =========================================================================
-- 2. Table abonnements_organismes : ce que chaque organisme formateur paie à
--    Olivier pour QalioFlex. Pas d'intégration Stripe automatique à ce jour
--    (roadmap V2 CONTEXT.md §8) → alimentée manuellement par Olivier via
--    l'espace superadmin. Utilisée pour estimer le CA récurrent par période.
-- =========================================================================
create table if not exists public.abonnements_organismes (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references public.organismes(id) on delete cascade,
  montant_centimes integer not null check (montant_centimes >= 0),
  periodicite text not null check (periodicite in ('mensuel', 'annuel')),
  statut text not null default 'actif' check (statut in ('actif', 'suspendu', 'resilie')),
  date_debut date not null default current_date,
  date_resiliation date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_abonnements_organisme on public.abonnements_organismes(organisme_id);

alter table public.abonnements_organismes enable row level security;
-- Aucune policy authenticated : gestion exclusivement via l'Edge Function
-- superadmin-gerer-abonnement (service role, gated ADMIN_EMAIL).

-- =========================================================================
-- 3. formations.montant_ht : montant numérique propre, distinct du champ texte
--    libre "tarif" déjà affiché aux clients (souvent "800€/jour", "Sur devis"...
--    non fiable pour une agrégation). Nullable : le CA "formations" du TdB
--    superadmin n'inclura que les formations où ce champ a été renseigné.
-- =========================================================================
alter table public.formations add column if not exists montant_ht numeric(10, 2);

comment on column public.formations.montant_ht is
  'Montant HT propre (numérique) utilisé pour le calcul du CA plateforme côté superadmin. Distinct du champ "tarif" (texte libre affiché au client).';
