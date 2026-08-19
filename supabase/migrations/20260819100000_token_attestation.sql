-- Chantier "consultation directe livret/attestation" (19/08/2026) : jusqu'ici
-- un stagiaire ne pouvait consulter son livret d'accueil ou son attestation de
-- fin de formation que via son espace client (compte requis) — écart connu et
-- documenté (rapport_test_e2e_qualioflex.md, section "hors périmètre") avec
-- toutes les autres étapes du flow (positionnement, émargement, évaluations)
-- qui, elles, ont toujours eu une page publique /xxx/:token dédiée.
--
-- token_livret existe déjà (migration 20260731093000) mais n'était jusqu'ici
-- utilisé que côté suivi de relance, jamais pour une vraie page de
-- consultation. token_attestation est nouveau : l'attestation est propre à un
-- STAGIAIRE (pas à la session), donc un token dédié, sur le même principe que
-- token_emargement/token_evaluation_* (texte simple, pas de valeur par
-- défaut, généré côté serveur/app avec crypto.randomUUID() lors de la
-- première génération de l'attestation).
alter table public.stagiaires
  add column if not exists token_attestation text;
