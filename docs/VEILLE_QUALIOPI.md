# Veille documentaire — Référentiel national qualité (Qualiopi)

Ce fichier sert de référence ("baseline") pour la veille automatique mise en place
le 31/07/2026 à la demande d'Olivier, afin de détecter toute évolution du
référentiel national qualité / guide de lecture Qualiopi et d'évaluer si
QualioFlex doit évoluer pour rester conforme.

Source officielle surveillée :
https://travail-emploi.gouv.fr/referentiel-national-qualite-guide-de-lecture-qualiopi

## Dernier relevé connu (baseline)

- Date de relevé : 01/10/2026
- Changement détecté le 01/10/2026 (alerte de la veille automatique), **vérifié
  indépendamment par Claude** via recherche web croisée sur plusieurs sources
  tierces (la tâche planifiée elle-même n'avait pas pu accéder au PDF officiel
  pour confirmer — voir « Limites techniques » ci-dessous).
- Nouvelle version : **référentiel V10**, issue du **Décret n° 2026-728**,
  **applicable à compter du 1er novembre 2026**.
- Structure : passage de **32 à 33 indicateurs** (ajout d'un nouvel
  indicateur 33, portant sur l'évaluation pédagogique des acquis des
  stagiaires, distincte de l'enquête de satisfaction).
- Indicateurs recensés comme modifiés/renforcés par le décret (liste la plus
  complète trouvée, croisée sur plusieurs sources tierces — à confirmer sur
  le PDF officiel dès qu'il sera accessible) : **1, 2, 3, 7, 12, 13, 14, 15,
  19, 20, 27, 32**. Le reste des indicateurs (20 au total) reste inchangé.
  Parmi les changements les plus structurants pour QualioFlex :
  - **Indicateur 33 (nouveau)** — évaluation pédagogique des acquis,
    distincte de la satisfaction.
  - **Indicateur 19 (renforcé)** — vérification de l'achèvement RÉEL des
    modules à distance (pas seulement déclaratif).
  - **Indicateur 27 (renforcé)** — contrat de sous-traitance écrit
    obligatoire.
  - **Indicateur 12 (renforcé)** — procédure écrite de prévention des
    violences/harcèlement/discriminations.
- Sources (toutes consultées le 01/10/2026, à recouper avec le PDF officiel
  du ministère dès qu'il sera publié/accessible) :
  - digi-certif.com (liste la plus détaillée des indicateurs modifiés)
  - alertisformation.com
  - qualiodocs.fr
  - page officielle travail-emploi.gouv.fr (citée par la tâche planifiée,
    non vérifiable directement par Claude — voir limites ci-dessous)

### Limites techniques connues sur ce relevé

- La tâche planifiée de veille n'a pas pu accéder au PDF officiel du guide
  de lecture pour vérifier le détail exact (pas de navigateur disponible
  dans cette exécution-là).
- Le même run a échoué à enregistrer son relevé dans `veille_qualiopi_log`
  via l'edge function `veille-qualiopi-log` (erreur réseau 403). Cause la
  plus probable, par analogie avec des blocages identiques rencontrés
  plusieurs fois cette session (sandbox Claude Code / pont vers
  l'ordinateur d'Olivier) : la politique réseau de l'environnement
  d'exécution de la tâche planifiée bloque les appels sortants vers
  `*.supabase.co`. **Non confirmé à 100 %** faute d'accès aux logs de cet
  environnement précis — à surveiller : si le prochain relevé mensuel
  échoue aussi à s'enregistrer, c'est probablement structurel et il faudra
  adapter le mécanisme (ex. exécuter cette tâche sur l'ordinateur
  d'Olivier plutôt qu'en environnement cloud isolé).
- Conséquence pratique : la page `/qualiopi-statut` (`VeilleQualiopi.tsx`)
  n'affiche donc PAS encore ce changement — aucune ligne n'a été insérée
  en base. À faire une fois le PDF officiel confirmé : soit corriger le
  mécanisme d'enregistrement, soit insérer manuellement la ligne via
  l'edge function `veille-qualiopi-log` (secret `VEILLE_QUALIOPI_SECRET`).

## Historique des versions (pour mémoire, du plus récent au plus ancien)

- **V10 — Décret n° 2026-728, applicable 01/11/2026 — 33 indicateurs**
  (nouveau, ce relevé)
- V.9 du 08/01/2024 — prise en compte de la sous-traitance (32 indicateurs,
  22 tronc commun + 10 spécifiques)
- V.8 du 23/11/2023 — précisions niveau attendu + exemples de preuves
- V.7 du 29/03/2021 — délai d'application, indicateurs 2/3/20/28
- V.6 du 05/10/2020 — accueil PSH, gradation non-conformités mineures
- V.5 du 28/02/2020 — précision indicateur 2 (CFA)
- V4.2 du 28/10/2019 — critère 19 commun (non spécifique)
- V.4.1 du 25/10/2019 — précision non-conformités majeures/mineures
- V3 du 22/07/2019 — suppression paragraphe VAE (indicateur 8)
- V2 du 19/07/2019 — titre indicateur 19, preuves indicateur 22

## Fonctionnement de la veille automatique

Une tâche planifiée (scheduled task, hors session — voir compte Olivier)
revisite périodiquement la page ci-dessus, extrait la date « Mis à jour
le » et la dernière version citée du guide de lecture, et compare au
relevé ci-dessus.

- Si rien n'a changé : aucune action, aucune notification.
- Si la date ou le numéro de version a changé : Olivier est notifié
  (push) avec un résumé de ce qui a changé, un lien direct vers le PDF à
  jour, et une proposition de points à vérifier dans QualioFlex (contenus
  générés — supports, programmes, émargements, conventions — qui citent
  ou s'appuient sur des indicateurs du référentiel).
- Ce fichier doit alors être mis à jour (nouvelle baseline) après lecture
  par Olivier ou par Claude lors d'une session de suivi.

## Points QualioFlex identifiés comme impactés par le passage à V10

Audit du code effectué le 01/10/2026 (branche `staging`), en réponse directe
à l'alerte V10 :

- **Textes codés en dur mentionnant « 32 indicateurs »** (à corriger en
  « 33 ») :
  - `src/pages/PreAudit.tsx` (commentaire + texte affiché à l'écran)
  - `supabase/functions/lancer-preaudit/index.ts` (commentaires + la liste
    `INDICATEURS` elle-même, qui ne couvre que 32 entrées)
- **`lancer-preaudit`** : la liste `INDICATEURS` est un référentiel interne
  de 32 contrôles **numérotés dans l'ordre (1 à 32) mais dont les libellés
  ne correspondent pas tous aux vrais intitulés officiels des indicateurs du
  même numéro** (ex. `ind_19` = « Veille légale et réglementaire » alors que
  le vrai indicateur 19 officiel porte sur le suivi des parcours à distance ;
  `ind_27` = « Dossiers administratifs complets » alors que le vrai
  indicateur 27 porte sur la sous-traitance). Ce décalage préexiste à V10
  mais la refonte V10 est l'occasion de le corriger en même temps que
  l'ajout du 33e indicateur.
- **Indicateur 33 (nouveau — évaluation pédagogique des acquis)** : aucune
  fonctionnalité dédiée ne semble exister. Les 3 questionnaires existants
  (`generer-questions-evaluation`, `evaluation-public` — types chaud /
  formateur / froid) sont tous des enquêtes de **satisfaction** (notation
  0 à 4 de l'organisation, de l'animation, etc.), pas des évaluations des
  connaissances/compétences acquises avec correction. Écart fonctionnel à
  combler.
- **Indicateur 19 renforcé (achèvement réel du distanciel)** : le champ
  « distanciel » n'existe aujourd'hui que comme texte libre dans un champ
  de modalités (`FormationCreation.tsx` / `FormationEdit.tsx`, placeholder
  « Présentiel / distanciel... »), sans traçabilité structurée d'achèvement
  réel (logs de connexion, suivi d'avancement). Écart fonctionnel probable.
- **Indicateur 27 renforcé (contrat de sous-traitance écrit)** : les
  fonctions `assigner-soustraitance`, `lier-soustraitance`,
  `verifier-invitation-soustraitance` gèrent l'affectation et les
  invitations, mais aucune ne génère de contrat de sous-traitance écrit
  (contrairement à `generer-convention`, qui existe pour la convention de
  formation classique mais n'est pas réutilisée ici). Écart fonctionnel
  probable.
- **Indicateur 12 renforcé (procédure écrite anti-violences/harcèlement)** :
  non audité en détail dans cette passe (dépend de contenu/document plutôt
  que de code) — à vérifier si un modèle de procédure existe déjà dans les
  documents génériques fournis aux organismes.

À revérifier à chaque nouveau changement détecté :
- Les modèles de support pédagogique / programme / livret d'accueil
  générés (`documents_formation`) — vocabulaire, mentions obligatoires.
- Le contenu des émargements et attestations.
- Les conventions de formation (Chantier 5 — signature DocuSign).
- Tout texte d'aide ou de documentation interne à QualioFlex mentionnant
  des indicateurs précis du référentiel.
