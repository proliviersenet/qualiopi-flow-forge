-- Ajoute les colonnes manquantes sur demandes_suppression_compte : la table
-- existait déjà avant la mise à jour du 18/08/2026, donc le
-- "create table if not exists" de la migration précédente n'a pas pu les
-- ajouter. Ce correctif utilise "add column if not exists" pour être sûr
-- de ne rien casser si une partie a déjà été appliquée.
alter table public.demandes_suppression_compte
  add column if not exists relance_j5_envoyee boolean not null default false,
  add column if not exists relance_j15_envoyee boolean not null default false,
  add column if not exists notif_olivier_envoyee boolean not null default false,
  add column if not exists supprimee_definitivement_le timestamptz;
