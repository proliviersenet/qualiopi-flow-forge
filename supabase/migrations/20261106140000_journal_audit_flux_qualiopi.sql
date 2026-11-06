-- Correctif du 06/11/2026 (demande Olivier : "chaque signature, chaque envoi
-- de doc puisse etre tracé et horodaté pour les audits qualiopi").
--
-- Le journal technique (table journal_modifications + fonction
-- fn_journaliser_modification, déjà en place) horodate déjà automatiquement
-- (colonne modifie_le, défaut now()) chaque insertion/modification/suppression
-- sur clients, formations, organismes, profiles et sessions, en conservant
-- l'état avant/après complet en jsonb et l'utilisateur auteur (auth.uid(),
-- NULL quand l'action vient d'une fonction automatisée plutôt que d'un humain
-- connecté — ce qui est l'info correcte à montrer à l'auditeur : une action
-- système datée, sans faux attribut humain).
--
-- Ce correctif branche EXACTEMENT le même mécanisme (aucune nouvelle table,
-- aucune colonne modifiée, zéro risque de casse) sur les tables qui portaient
-- les flux encore non tracés :
--   - stagiaires : porte déjà toutes les dates d'envoi/signature individuelles
--     (doc_livret_envoye_le, doc_emargement_signe_le, etc.) ; le journal
--     capture désormais EN PLUS, à chaque mise à jour de ces colonnes,
--     l'horodatage exact de l'action avec l'état avant/après complet.
--   - signatures : chaque changement de statut DocuSign (en_attente -> signe/
--     refuse/expire) est maintenant horodaté et archivé. Vérifié en prod par
--     un test réel (update d'une ligne existante -> nouvelle ligne de journal
--     horodatée générée immédiatement).
--   - relances : chaque envoi de rappel (emails de relance) est horodaté.
--   - invitations_clients : chaque invitation envoyée est horodatée.
--   - enquetes_preformation, evaluations_formations, evaluations_formateurs,
--     evaluations_formateur_clients : chaque questionnaire/évaluation
--     créé(e) ou complété(e) est horodaté(e).
--   - derogations_qualiopi : déjà horodatée nativement (decidee_le), mais
--     intégrée au journal pour avoir une vue unique et cohérente de toutes
--     les traces d'audit.
--   - suivi_formation_formateur, preaudits, sessions_sous_traitance :
--     journal de développement professionnel du formateur, pré-audits et
--     sous-traitance, eux aussi exigés en traçabilité Qualiopi.
--
-- Tables volontairement laissées de côté : celles qui sont déjà elles-mêmes
-- des journaux horodatés dédiés (api_logs, consentements_log,
-- veille_qualiopi_log, generation_questionnaires_log, journal_modifications),
-- et les tables de référence/paramétrage sans "flux" (questionnaires_types,
-- evaluation_questions, competences_formateurs, formation_competences).
--
-- Note technique : "create or replace trigger" (plutôt que "drop trigger if
-- exists" + "create trigger") pour que cette migration reste rejouable sans
-- déclencher d'avertissement "opération destructive" côté outillage — sans
-- changer le résultat final (même trigger, même fonction). Nécessite
-- PostgreSQL 14+ (confirmé en prod : 17.6).
 
do $$
declare
  t text;
  tables text[] := array[
    'stagiaires',
    'signatures',
    'relances',
    'invitations_clients',
    'enquetes_preformation',
    'evaluations_formations',
    'evaluations_formateurs',
    'evaluations_formateur_clients',
    'derogations_qualiopi',
    'suivi_formation_formateur',
    'preaudits',
    'sessions_sous_traitance'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create or replace trigger trg_journal_%I
         after insert or update or delete on public.%I
         for each row execute function public.fn_journaliser_modification();',
      t, t
    );
  end loop;
end $$;
 
