-- Journal des contrôles de la veille documentaire Qualiopi (référentiel national qualité).
-- Une ligne par contrôle mensuel automatique. Écriture réservée à l'Edge Function
-- veille-qualiopi-log (clé service_role) — aucune policy INSERT/UPDATE n'est créée ici.

create table if not exists public.veille_qualiopi_log (
  id uuid primary key default gen_random_uuid(),
  date_verification timestamptz not null default now(),
  version_referentiel text not null,
  date_maj_referentiel date,
  statut text not null check (statut in ('inchange', 'changement_detecte')),
  resume text,
  lien_pdf text,
  created_at timestamptz not null default now()
);

alter table public.veille_qualiopi_log enable row level security;

create policy "Formateurs can view veille qualiopi log"
  on public.veille_qualiopi_log
  for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'formateur');

-- Seed : baseline connue au moment de la mise en place de la veille (31/07/2026).
insert into public.veille_qualiopi_log
  (date_verification, version_referentiel, date_maj_referentiel, statut, resume, lien_pdf)
values (
  '2026-07-31T00:00:00Z',
  'V.9 du 08/01/2024',
  '2024-01-08',
  'inchange',
  'Baseline initiale de la veille automatique. Référentiel national qualité, 7 critères / 32 indicateurs (22 communs + 10 spécifiques). Cette version reprend l''ensemble des précisions de la V8 et prend en compte les spécificités liées à la sous-traitance.',
  'https://travail-emploi.gouv.fr/referentiel-national-qualite-guide-de-lecture-qualiopi'
);
