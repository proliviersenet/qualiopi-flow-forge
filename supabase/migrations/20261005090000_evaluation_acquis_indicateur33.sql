-- Indicateur 33 (nouveau, référentiel Qualiopi V10 applicable au 01/11/2026) :
-- évaluation des acquis pédagogiques, distincte des évaluations de satisfaction
-- (chaud/formateur/froid) déjà en place. Ajout d'un 4e type d'évaluation "acquis",
-- sous forme de QCM noté automatiquement (score en %), sur le même mécanisme
-- (token public, evaluation_questions, Edge Function evaluation-public) que les
-- 3 types existants — colonnes miroir de celles de chaud/formateur/froid.
--
-- score_evaluation_acquis est séparé de reponses_evaluation_acquis (plutôt que
-- lu depuis le jsonb à chaque fois) pour pouvoir calculer une moyenne de groupe
-- par simple agrégat SQL/JS, comme le fait StagiairesList.tsx pour l'affichage.

alter table public.stagiaires
  add column if not exists doc_evaluation_acquis text,
  add column if not exists doc_evaluation_acquis_envoye_le timestamptz,
  add column if not exists doc_evaluation_acquis_alerte_envoyee boolean not null default false,
  add column if not exists doc_evaluation_acquis_relance_j2_envoyee boolean not null default false,
  add column if not exists token_evaluation_acquis text,
  add column if not exists reponses_evaluation_acquis jsonb,
  add column if not exists score_evaluation_acquis numeric;

create unique index if not exists stagiaires_token_evaluation_acquis_key
  on public.stagiaires (token_evaluation_acquis);
