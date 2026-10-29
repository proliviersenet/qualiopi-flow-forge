-- Retour terrain Olivier (08/10/2026) : quand le formateur ajoute lui-même un
-- client via "+ Ajouter un client" (ClientDetail.tsx insère directement dans
-- `clients`, sans passer par l'invitation), le client créé n'a jamais reçu
-- aucun email et n'a donc aucun moyen de se connecter à son espace — seul le
-- bouton séparé "✉️ Inviter un client" (qui ne pré-remplit RIEN et crée sa
-- PROPRE ligne `clients` au moment où l'invité valide son SIREN, via
-- creer-compte-client) envoyait réellement un email.
--
-- On relie maintenant les deux parcours : `invitations_clients` peut porter un
-- client_id existant, pour que creer-compte-client METTE À JOUR cette ligne au
-- lieu d'en créer une seconde en doublon (voir cette migration + les edge
-- functions envoyer-invitation et creer-compte-client, et Clients.tsx qui
-- déclenche maintenant automatiquement l'invitation après "Ajouter un client").
-- Nullable et sans contrainte NOT NULL : le parcours "Inviter un client" sans
-- fiche préexistante continue de fonctionner à l'identique (client_id reste null).

alter table public.invitations_clients
  add column if not exists client_id uuid references public.clients(id) on delete set null;
