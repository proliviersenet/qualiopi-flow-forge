-- Suivi des demandes de suppression de compte formateur : permet de savoir
-- quels comptes sont bannis (inaccessibles) suite à une demande de
-- suppression, avec une fenêtre de 30 jours durant laquelle Olivier peut
-- restaurer manuellement l'accès. Table interne, jamais exposée au
-- frontend : seule la clé service_role (Edge Functions
-- demander-suppression-compte / restaurer-compte-formateur /
-- relance-suppression-compte / lister-demandes-suppression /
-- valider-suppression-definitive) peut y lire/écrire.
--
-- relance_j5_envoyee / relance_j15_envoyee : relances automatiques au
-- formateur (jours 5 et 15) l'informant du délai restant avant suppression
-- définitive.
-- notif_olivier_envoyee : notification à Olivier au jour 30 — c'est lui qui
-- valide ensuite manuellement la suppression définitive (page
-- /admin/suppressions), rien n'est purgé automatiquement.
-- supprimee_definitivement_le : renseigné si/quand la suppression
-- définitive a réellement pu être effectuée (voir plus bas : certains
-- comptes ne pourront pas être supprimés en base tant qu'ils ont des
-- données de formation liées, contraintes RESTRICT sur plusieurs tables).

create table if not exists public.demandes_suppression_compte (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  avec_recuperation boolean not null default false,
  mode_paiement text,
  demandee_le timestamptz not null default now(),
  restauree_le timestamptz,
  relance_j5_envoyee boolean not null default false,
  relance_j15_envoyee boolean not null default false,
  notif_olivier_envoyee boolean not null default false,
  supprimee_definitivement_le timestamptz
);

create index if not exists idx_demandes_suppression_compte_user
  on public.demandes_suppression_compte (user_id, demandee_le desc);

create index if not exists idx_demandes_suppression_compte_email
  on public.demandes_suppression_compte (email);

alter table public.demandes_suppression_compte enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'ont accès,
-- même en lecture. Seule la clé service_role peut lire/écrire cette table.

-- Cron quotidien pour la nouvelle Edge Function relance-suppression-compte
-- (relances J+5 / J+15 au formateur, notification à Olivier au J+30). Même
-- convention que les crons existants (alerte-avant-formation,
-- archiver-formations-surveillance) : x-cron-secret en clair, valeur du
-- secret CRON_SECRET déjà configuré côté Edge Functions.
select cron.schedule(
  'relance-suppression-compte-quotidien',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://cvgosywcwqmsegdgjpqp.supabase.co/functions/v1/relance-suppression-compte',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '3abe2780ee7c5970a43a6c345ab262c3f11ac621570032d77f442b7ece81b3b1'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
