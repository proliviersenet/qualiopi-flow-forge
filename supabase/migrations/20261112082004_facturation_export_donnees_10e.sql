-- Export des données payant (10 € HT), décision Olivier du 12/11/2026 :
-- carte uniquement (virement supprimé), conventions DocuSign signées incluses,
-- même export pour la résiliation et la suppression de compte.

-- 1. Tarif dans la grille (modifiable sans redéploiement)
alter table public.tarifs drop constraint tarifs_code_check;
alter table public.tarifs add constraint tarifs_code_check
  check (code in ('abonnement_mensuel', 'session', 'export_donnees'));
insert into public.tarifs (code, libelle, montant_ht_centimes)
values ('export_donnees', 'Export complet des données QualioFlex', 1000);

-- 2. Client Stripe unique par organisme (partagé abonnement / export)
alter table public.organismes add column stripe_customer_id text unique;

-- 3. Paiements ponctuels reliés à l'organisme, au contexte, à la facture et à l'export
alter table public.paiements_stripe
  add column organisme_id uuid references public.organismes(id) on delete set null,
  add column contexte text check (contexte in ('suppression', 'resiliation', 'autre')),
  add column stripe_invoice_id text,
  add column facture_id uuid references public.factures(id) on delete set null;
create index paiements_stripe_session_idx on public.paiements_stripe(stripe_session_id);

-- 4. Table exports : nouveau type, nouveaux statuts, traçabilité de l'envoi
alter table public.exports drop constraint if exists exports_type_check;
alter table public.exports add constraint exports_type_check
  check (type in ('audit_pdf', 'audit_zip', 'bpf', 'recuperation_donnees'));
alter table public.exports drop constraint if exists exports_statut_check;
alter table public.exports add constraint exports_statut_check
  check (statut in ('en_attente', 'en_cours', 'pret', 'envoye', 'erreur'));
alter table public.exports
  add column paiement_id uuid references public.paiements_stripe(id) on delete set null,
  add column email_destinataire text,
  add column taille_octets bigint,
  add column lien_expire_le timestamptz,
  add column envoye_le timestamptz,
  add column erreur text,
  add column statistiques jsonb;
create unique index exports_paiement_unique on public.exports(paiement_id) where paiement_id is not null;

alter table public.paiements_stripe add column export_id uuid references public.exports(id) on delete set null;

-- 5. Journal d'audit + lecture par le formateur
create trigger trg_journal_exports after insert or update or delete on public.exports
  for each row execute function public.fn_journaliser_modification();
create policy exports_select_membre on public.exports
  for select to authenticated using (public.fn_est_membre_organisme(organisme_id));
create policy paiements_stripe_select_proprio on public.paiements_stripe
  for select to authenticated using (user_id = auth.uid());

-- 6. Stockage privé des archives (accès uniquement par lien signé)
insert into storage.buckets (id, name, public)
values ('exports-donnees', 'exports-donnees', false)
on conflict (id) do nothing;
