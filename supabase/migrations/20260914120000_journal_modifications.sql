-- Chantier "audit trail" (point 10 de l'audit du 14/09) : journal générique
-- des modifications sur les données métier sensibles. Objectif : pouvoir
-- répondre à "qui a changé quoi, et quand" sur un organisme, une formation,
-- une session, un client, un document généré ou un profil — ce qui n'existait
-- nulle part avant ce chantier.
--
-- Principe : un déclencheur (trigger) générique, posé sur chaque table
-- suivie, enregistre automatiquement l'ancien contenu, le nouveau contenu,
-- l'utilisateur (si connu) et l'horodatage à chaque création, modification ou
-- suppression. Rien à changer côté application : ça fonctionne même pour les
-- écritures faites depuis les Edge Functions.
--
-- Le journal est en lecture seule pour tout le monde sauf la clé
-- service_role (même principe que demandes_suppression_compte) : consultable
-- uniquement via une Edge Function réservée à l'administrateur (voir
-- superadmin-explorer, action "lister" / type "journal").

create table if not exists public.journal_modifications (
  id bigint generated always as identity primary key,
  table_source text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  enregistrement_id uuid,
  ancien_contenu jsonb,
  nouveau_contenu jsonb,
  utilisateur_id uuid references auth.users(id) on delete set null,
  modifie_le timestamptz not null default now()
);

create index if not exists idx_journal_modifications_table_enregistrement
  on public.journal_modifications (table_source, enregistrement_id);

create index if not exists idx_journal_modifications_date
  on public.journal_modifications (modifie_le desc);

alter table public.journal_modifications enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'ont accès, même
-- en lecture — uniquement la clé service_role (Edge Functions superadmin).

-- Fonction générique posée en trigger sur chaque table suivie. security
-- definer : nécessaire pour que l'écriture dans journal_modifications
-- réussisse même si l'utilisateur qui déclenche la modification (un
-- formateur, par exemple) n'a normalement aucun droit d'écriture sur cette
-- table protégée par RLS.
create or replace function public.fn_journaliser_modification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if (tg_op = 'DELETE') then
    v_id := old.id;
  else
    v_id := new.id;
  end if;

  insert into public.journal_modifications
    (table_source, operation, enregistrement_id, ancien_contenu, nouveau_contenu, utilisateur_id)
  values (
    tg_table_name,
    tg_op,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );

  if (tg_op = 'DELETE') then
    return old;
  else
    return new;
  end if;
end;
$$;

-- Tables suivies : les données métier "sensibles" identifiées dans l'audit
-- du 14/09 (organismes, formations, sessions, clients, documents générés,
-- profils). Extensible plus tard à d'autres tables si besoin, en répétant
-- simplement le même schéma pour une nouvelle table.

drop trigger if exists trg_journal_organismes on public.organismes;
create trigger trg_journal_organismes
  after insert or update or delete on public.organismes
  for each row execute function public.fn_journaliser_modification();

drop trigger if exists trg_journal_formations on public.formations;
create trigger trg_journal_formations
  after insert or update or delete on public.formations
  for each row execute function public.fn_journaliser_modification();

drop trigger if exists trg_journal_sessions on public.sessions;
create trigger trg_journal_sessions
  after insert or update or delete on public.sessions
  for each row execute function public.fn_journaliser_modification();

drop trigger if exists trg_journal_clients on public.clients;
create trigger trg_journal_clients
  after insert or update or delete on public.clients
  for each row execute function public.fn_journaliser_modification();

drop trigger if exists trg_journal_documents_formation on public.documents_formation;
create trigger trg_journal_documents_formation
  after insert or update or delete on public.documents_formation
  for each row execute function public.fn_journaliser_modification();

drop trigger if exists trg_journal_profiles on public.profiles;
create trigger trg_journal_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.fn_journaliser_modification();
