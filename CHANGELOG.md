# Journal des versions — QualioFlex

Ce fichier recense les évolutions notables de l'application, dans l'ordre chronologique inverse (les plus récentes en haut). Il répond au point 18 de l'audit "Processus digital" du 14/09/2026 (gestion des changements).

Format : chaque entrée indique la date, un résumé de ce qui a changé et pourquoi, et les fichiers ou fonctions principalement concernés. Le détail technique complet reste dans l'historique Git ; ce journal donne la vue d'ensemble lisible sans avoir à dérouler les commits.

À faire avant chaque mise en production : ajouter une entrée ici (voir `checklist_deploiement.md`, étape "Relire le diff").

## Non publié (en cours sur `staging`)

- **Double authentification (2FA)** — étude et mise en place en cours pour les comptes formateur (point 13 de l'audit).

## 2026-09-14

- **Journal des modifications (audit trail)** — création de la table `journal_modifications` et de triggers sur les tables sensibles (`organismes`, `formations`, `sessions`, `clients`, `documents_formation`, `profiles`) : chaque création/modification/suppression enregistre l'ancien contenu, le nouveau contenu, l'auteur et l'horodatage. Consultable par l'administrateur uniquement, via Explorateur SAV → Journal d'activité. Répond au point 10 de l'audit "Processus digital" (absence d'audit trail).
- **Environnement de test (staging)** — mise en place d'un environnement complet séparé de la production : nouveau projet Supabase de test (schéma cloné et vérifié à l'identique : 42 tables, 164 contraintes, 12 fonctions, 8 triggers, 68 policies), copie des 49 fonctions serveur, branche GitHub `staging`, déploiement Vercel dédié (variables d'environnement isolées, aucun impact sur la production). Répond au point 18 de l'audit (absence d'environnement de test séparé).
- **Checklist de déploiement** — rédaction de la procédure à suivre pour toute mise en production (développement et vérification sur staging d'abord, relecture, bascule vers `main`, surveillance post-déploiement).

## Avant le 14/09/2026

Historique non tracé formellement dans ce journal — se référer à l'historique Git du dépôt (`git log`) pour le détail des évolutions antérieures. Les principales fonctionnalités existantes à cette date : gestion des formations/sessions/clients, émargement électronique, génération de documents (conventions, attestations, devis, livrets), questionnaires de positionnement et d'évaluation, pré-audit Qualiopi, sous-traitance entre organismes, notifications automatiques, tableau de bord Superadmin, paiements Stripe, signature DocuSign.
