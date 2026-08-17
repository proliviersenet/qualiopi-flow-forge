-- Paiements Stripe : trace des paiements ponctuels effectués via Stripe
-- Checkout (ex : frais de récupération de données lors d'une suppression
-- de compte). Table interne, jamais exposée au frontend : seule la clé
-- service_role (utilisée par les Edge Functions stripe-checkout-* et
-- stripe-webhook) peut y lire/écrire.

create table if not exists public.paiements_stripe (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  motif text not null,
  montant_centimes integer not null,
  devise text not null default 'eur',
  stripe_session_id text not null unique,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'paye', 'echec')),
  created_at timestamptz not null default now(),
  paye_le timestamptz
);

create index if not exists idx_paiements_stripe_user
  on public.paiements_stripe (user_id, created_at desc);

alter table public.paiements_stripe enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'ont accès,
-- même en lecture. Seule la clé service_role peut lire/écrire cette table.
