-- Bug bloquant remonté par Olivier le 07/10/2026 : la génération du QCM
-- "évaluation des acquis" (indicateur 33) échouait systématiquement avec
-- "Échec de la sauvegarde des questions : new row for relation
-- evaluation_questions violates check constraint evaluation_questions_type_check".
--
-- La contrainte CHECK sur evaluation_questions.type n'avait jamais été étendue
-- pour accepter "acquis" lors de l'ajout de ce 4e type d'évaluation (migration
-- 20261005090000_evaluation_acquis_indicateur33.sql) — seules les colonnes de
-- stagiaires avaient été migrées, pas cette contrainte. Les fonctions Edge
-- generer-questions-evaluation / evaluation-public étaient pourtant déjà prêtes
-- côté code pour "acquis".

alter table public.evaluation_questions drop constraint evaluation_questions_type_check;
alter table public.evaluation_questions add constraint evaluation_questions_type_check
  check (type = any (array['chaud'::text, 'formateur'::text, 'froid'::text, 'acquis'::text]));
