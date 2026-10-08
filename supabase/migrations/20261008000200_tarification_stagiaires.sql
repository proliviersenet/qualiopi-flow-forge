-- Demande d'Olivier (07-08/10/2026) : le tarif d'une formation doit pouvoir
-- être indiqué par stagiaire et par jour, avec un plafond sur le prix TOTAL
-- de la formation et un nombre de stagiaires maximum accepté. Le nombre de
-- stagiaires doit pouvoir être saisi à deux endroits : lors de l'affectation
-- d'une formation à un client, et à l'ouverture de la création d'un devis,
-- afin que le tarif total se calcule automatiquement — tout en restant
-- toujours modifiable par le formateur, qui valide le montant final.
--
-- Choix actés avec Olivier (réponses au clarifying) :
--  - Ces nouveaux champs COEXISTENT avec le "Tarif" en texte libre existant
--    (ne le remplacent pas).
--  - Le "tarif max" est un plafond sur le prix TOTAL de la formation (pas
--    par stagiaire).
--  - "Durée" reste un champ texte libre non structuré ; on ajoute un champ
--    numérique dédié "nb_jours" pour le calcul, plutôt que de le parser.
--  - Le nombre de stagiaires est saisi aux deux endroits (affectation ET
--    génération de devis) : nb_stagiaires_estime sur sessions porte cette
--    estimation, et montant_devis porte le montant final validé par le
--    formateur avant génération du devis (voir generer-devis/index.ts et
--    ClientDetail.tsx).

alter table public.formations
  add column if not exists tarif_stagiaire_jour numeric,
  add column if not exists nb_jours numeric,
  add column if not exists tarif_max numeric,
  add column if not exists nb_stagiaires_max integer;

alter table public.sessions
  add column if not exists nb_stagiaires_estime integer,
  add column if not exists montant_devis numeric;
