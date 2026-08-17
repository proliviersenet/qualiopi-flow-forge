-- Historique des mots de passe : empêche la réutilisation des 5 derniers
-- mots de passe lors d'un changement de mot de passe (formateur, client,
-- réinitialisation). Aucune donnée en clair n'est stockée : seul un hash
-- bcrypt (pgcrypto) est conservé, et uniquement accessible via service_role
-- (donc uniquement depuis l'Edge Function `changer-mot-de-passe`).

create table if not exists public.password_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_history_user_created
  on public.password_history (user_id, created_at desc);

alter table public.password_history enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'ont accès,
-- même en lecture. Seule la clé service_role (utilisée uniquement côté
-- Edge Function) peut lire/écrire cette table, car elle bypass RLS.

-- Fonctions utilitaires de hachage / comparaison bcrypt, réservées au
-- rôle service_role uniquement (jamais exécutables depuis le frontend).
create or replace function public.hash_password_for_history(plain text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.crypt(plain, extensions.gen_salt('bf'));
$$;

create or replace function public.password_matches_hash(plain text, hash text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.crypt(plain, hash) = hash;
$$;

revoke all on function public.hash_password_for_history(text) from public;
revoke all on function public.hash_password_for_history(text) from anon;
revoke all on function public.hash_password_for_history(text) from authenticated;
grant execute on function public.hash_password_for_history(text) to service_role;

revoke all on function public.password_matches_hash(text, text) from public;
revoke all on function public.password_matches_hash(text, text) from anon;
revoke all on function public.password_matches_hash(text, text) from authenticated;
grant execute on function public.password_matches_hash(text, text) to service_role;
