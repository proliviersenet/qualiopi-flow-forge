-- =====================================================================
-- Chantier abonnement / paiement / facturation — LOT 1 : modèle de données
-- 09/11/2026. Décisions Olivier : 34,90 € HT/mois + 5 € HT/session,
-- essai 7 j avec CB, facture agrégée le 1er du mois, session facturable
-- à J-48h (ou à l'affectation si plus tard), payeur = organisme
-- propriétaire de la formation (donneur d'ordre), parrainage en mois
-- offerts, super ambassadeurs exemptés. Refonte ADDITIVE de
-- abonnements_organismes pour ne pas casser superadmin-kpis/explorer/
-- gerer-abonnement.
-- (Session passée à 3 € HT le 09/11 directement dans public.tarifs.)
-- =====================================================================

-- Helper : l'utilisateur courant appartient-il à l'organisme ?
create or replace function public.fn_est_membre_organisme(p_organisme_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from organismes o where o.id = p_organisme_id and o.owner_user_id = auth.uid())
      or exists (select 1 from profiles p where p.id = auth.uid() and p.organisme_id = p_organisme_id);
$$;

-- ---------------------------------------------------------------------
-- 1. tarifs : grille modifiable sans redéploiement
-- ---------------------------------------------------------------------
create table public.tarifs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('abonnement_mensuel', 'session')),
  libelle text not null,
  montant_ht_centimes integer not null check (montant_ht_centimes >= 0),
  taux_tva numeric(5,2) not null default 20.00,
  stripe_price_id text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.tarifs (code, libelle, montant_ht_centimes) values
  ('abonnement_mensuel', 'Abonnement QualioFlex mensuel', 3490),
  ('session', 'Session de formation', 500);

-- ---------------------------------------------------------------------
-- 2. abonnements_organismes : refonte additive
-- ---------------------------------------------------------------------
delete from public.abonnements_organismes;  -- ligne de test (validé par Olivier)

alter table public.abonnements_organismes
  alter column montant_centimes set default 3490,
  alter column periodicite set default 'mensuel',
  add column type_compte text not null default 'standard'
    check (type_compte in ('standard', 'super_ambassadeur')),
  add column stripe_customer_id text,
  add column stripe_subscription_id text unique,
  add column debut_essai timestamptz,
  add column fin_essai timestamptz,
  add column rappel_fin_essai_envoye_le timestamptz,
  add column resiliation_demandee_le timestamptz,
  add column resiliation_effective_le date,
  add column impaye_depuis timestamptz,
  add column coupure_prevue_le timestamptz,
  add column coupe_le timestamptz,
  add column reactive_le timestamptz;

alter table public.abonnements_organismes drop constraint abonnements_organismes_statut_check;
alter table public.abonnements_organismes add constraint abonnements_organismes_statut_check
  check (statut in ('essai', 'actif', 'impaye', 'coupe', 'resiliation_programmee', 'resilie', 'suspendu', 'exempte'));
alter table public.abonnements_organismes add constraint abonnements_organismes_organisme_unique unique (organisme_id);

-- ---------------------------------------------------------------------
-- 3. factures : copie locale pour l'espace formateur
-- ---------------------------------------------------------------------
create table public.factures (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references public.organismes(id) on delete restrict,
  stripe_invoice_id text unique,
  numero text,
  periode_debut date,
  periode_fin date,
  montant_ht_centimes integer not null default 0,
  montant_tva_centimes integer not null default 0,
  montant_ttc_centimes integer not null default 0,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'ouverte', 'payee', 'impayee', 'annulee')),
  mois_offert boolean not null default false,
  pdf_url text,
  hosted_url text,
  emise_le timestamptz,
  payee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index factures_organisme_idx on public.factures(organisme_id, emise_le desc);

-- ---------------------------------------------------------------------
-- 4. sessions_facturables : registre des sessions facturées
-- ---------------------------------------------------------------------
create table public.sessions_facturables (
  id uuid primary key default gen_random_uuid(),
  session_id uuid unique references public.sessions(id) on delete set null,
  organisme_id uuid not null references public.organismes(id) on delete restrict,  -- payeur = donneur d'ordre
  libelle text not null,                -- instantané : formation, client, date (survit à la suppression de la session)
  date_debut_session date,
  montant_ht_centimes integer not null check (montant_ht_centimes >= 0),
  facturable_le timestamptz not null,   -- J-48h avant date_debut, ou affectation si plus tard
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'a_facturer', 'facturee', 'annulee_sans_frais', 'offerte', 'exemptee')),
  periode_facturation date,             -- 1er du mois de facturation
  facture_id uuid references public.factures(id) on delete set null,
  stripe_invoice_item_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_facturables_organisme_idx on public.sessions_facturables(organisme_id, statut);
create index sessions_facturables_facturable_idx on public.sessions_facturables(statut, facturable_le);

-- ---------------------------------------------------------------------
-- 5. Parrainage
-- ---------------------------------------------------------------------
create table public.codes_parrainage (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null unique references public.organismes(id) on delete cascade,
  code text not null unique,
  type text not null default 'standard' check (type in ('standard', 'super_ambassadeur')),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parrainages (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.codes_parrainage(id) on delete restrict,
  parrain_organisme_id uuid not null references public.organismes(id) on delete cascade,
  filleul_organisme_id uuid not null unique references public.organismes(id) on delete cascade,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'confirme', 'annule')),
  inscrit_le timestamptz not null default now(),
  confirme_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parrain_organisme_id <> filleul_organisme_id)
);
create index parrainages_parrain_idx on public.parrainages(parrain_organisme_id);

-- Registre append-only : solde = lignes non consommées, jamais stocké
create table public.mois_offerts (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references public.organismes(id) on delete cascade,
  motif text not null
    check (motif in ('parrainage_parrain', 'parrainage_filleul', 'offert_ambassadeur', 'ajustement_manuel')),
  parrainage_id uuid references public.parrainages(id) on delete set null,
  commentaire text,
  accorde_le timestamptz not null default now(),
  consomme_le timestamptz,
  facture_id uuid references public.factures(id) on delete set null,
  created_at timestamptz not null default now()
);
create index mois_offerts_organisme_idx on public.mois_offerts(organisme_id, consomme_le);

create or replace function public.fn_proteger_mois_offerts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'mois_offerts est un registre append-only : suppression interdite (passer par un ajustement_manuel).';
  end if;
  -- Seule modification permise : marquer une ligne non consommée comme consommée
  if old.consomme_le is not null
     or new.organisme_id <> old.organisme_id
     or new.motif <> old.motif
     or new.accorde_le <> old.accorde_le
     or new.parrainage_id is distinct from old.parrainage_id then
    raise exception 'mois_offerts : seule la consommation d''un mois non encore consommé est autorisée.';
  end if;
  return new;
end;
$$;
create trigger trg_proteger_mois_offerts
  before update or delete on public.mois_offerts
  for each row execute function public.fn_proteger_mois_offerts();

create view public.v_solde_mois_offerts
with (security_invoker = true) as
select organisme_id,
       count(*)::int as mois_gagnes,
       count(consomme_le)::int as mois_utilises,
       (count(*) - count(consomme_le))::int as mois_restants
from public.mois_offerts
group by organisme_id;

-- ---------------------------------------------------------------------
-- 6. notifications_abonnement : anti-doublon des rappels
-- ---------------------------------------------------------------------
create table public.notifications_abonnement (
  id uuid primary key default gen_random_uuid(),
  organisme_id uuid not null references public.organismes(id) on delete cascade,
  type text not null check (type in (
    'fin_essai_rappel', 'impaye_alerte', 'impaye_relance_j2', 'coupure', 'reactivation',
    'resiliation_confirmee', 'carte_expiration', 'parrainage_confirme', 'bienvenue_filleul')),
  reference text not null default '',   -- ex : id facture Stripe, id parrainage
  canal text not null default 'email' check (canal in ('email', 'app', 'email_app')),
  envoye_le timestamptz not null default now(),
  unique (organisme_id, type, reference)
);

-- ---------------------------------------------------------------------
-- 7. Journal d'audit sur toutes les nouvelles tables + abonnements
-- ---------------------------------------------------------------------
create trigger trg_journal_tarifs after insert or update or delete on public.tarifs
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_abonnements_organismes after insert or update or delete on public.abonnements_organismes
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_paiements_stripe after insert or update or delete on public.paiements_stripe
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_factures after insert or update or delete on public.factures
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_sessions_facturables after insert or update or delete on public.sessions_facturables
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_codes_parrainage after insert or update or delete on public.codes_parrainage
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_parrainages after insert or update or delete on public.parrainages
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_mois_offerts after insert or update or delete on public.mois_offerts
  for each row execute function public.fn_journaliser_modification();
create trigger trg_journal_notifications_abonnement after insert or update or delete on public.notifications_abonnement
  for each row execute function public.fn_journaliser_modification();

-- ---------------------------------------------------------------------
-- 8. RLS : le formateur LIT ses données, seules les fonctions serveur
--    (service_role) écrivent. Aucune policy d'écriture = écriture bloquée.
-- ---------------------------------------------------------------------
alter table public.tarifs enable row level security;
alter table public.factures enable row level security;
alter table public.sessions_facturables enable row level security;
alter table public.codes_parrainage enable row level security;
alter table public.parrainages enable row level security;
alter table public.mois_offerts enable row level security;
alter table public.notifications_abonnement enable row level security;

create policy tarifs_select_authenticated on public.tarifs
  for select to authenticated using (actif);
create policy abonnements_select_membre on public.abonnements_organismes
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy factures_select_membre on public.factures
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy sessions_facturables_select_membre on public.sessions_facturables
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy codes_parrainage_select_membre on public.codes_parrainage
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy parrainages_select_membre on public.parrainages
  for select to authenticated using (public.fn_est_membre_organisme(parrain_organisme_id)
                                  or public.fn_est_membre_organisme(filleul_organisme_id));
create policy mois_offerts_select_membre on public.mois_offerts
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy notifications_abonnement_select_membre on public.notifications_abonnement
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
