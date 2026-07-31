-- Chantier 5 (suite, audit 31/07/2026) : extension de la relance automatique
-- J+2 / alerte J+5 (Edge Function relance-documents-auto) aux deux documents les
-- plus importants du flow Qualiopi (CONTEXT.md, "Flow documentaire Qualiopi
-- complet") : le livret d'accueil et le questionnaire de positionnement AVANT
-- formation (étape BLOQUANTE).
--
-- doc_questionnaire_avant et token_questionnaire_avant existaient déjà (utilisés
-- par positionnement-public/index.ts et Positionnement.tsx) mais leurs colonnes
-- de suivi de relance (envoye_le / relance_j2 / alerte) n'avaient jamais été
-- créées, faute d'avoir été branchées sur relance-documents-auto jusqu'ici.
--
-- doc_livret / token_livret n'existaient pas du tout : le livret n'était géré
-- jusqu'ici qu'au niveau de la session (table documents_formation, généré par
-- generer-livret), sans suivi individuel par stagiaire.

alter table public.stagiaires
  add column if not exists doc_livret text,
  add column if not exists doc_livret_envoye_le timestamptz,
  add column if not exists doc_livret_relance_j2_envoyee boolean not null default false,
  add column if not exists doc_livret_alerte_envoyee boolean not null default false,
  add column if not exists token_livret text,
  add column if not exists doc_questionnaire_avant_envoye_le timestamptz,
  add column if not exists doc_questionnaire_avant_relance_j2_envoyee boolean not null default false,
  add column if not exists doc_questionnaire_avant_alerte_envoyee boolean not null default false;
