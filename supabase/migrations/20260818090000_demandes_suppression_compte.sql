-- Suivi des demandes de suppression de compte formateur : permet de savoir
-- quels comptes sont bannis (inaccessibles) suite à une demande de
-- suppression, avec une fenêtre de 30 jours durant laquelle Olivier peut
-- restaurer manuellement l'accès. Table interne, jamais exposée au
-- frontend : seule la clé service_role (Edge Functions
-- demander-suppression-compte / restaurer-compte-formateur) peut y
-- lire/écrire.

create table if not exists public.demandes_suppression_compte (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  avec_recuperation boolean not null default false,
  mode_paiement text,
  demandee_le timestamptz not null default now(),
  restauree_le timestamptz
);

create index if not exists idx_demandes_suppression_compte_user
  on public.demandes_suppression_compte (user_id, demandee_le desc);

create index if not exists idx_demandes_suppression_compte_email
  on public.demandes_suppression_compte (email);

alter table public.demandes_suppression_compte enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'ont accès,
-- même en lecture. Seule la clé service_role peut lire/écrire cette table.
