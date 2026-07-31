# Veille documentaire — Référentiel national qualité (Qualiopi)

Ce fichier sert de référence ("baseline") pour la veille automatique mise en place
le 31/07/2026 à la demande d'Olivier, afin de détecter toute évolution du
référentiel national qualité / guide de lecture Qualiopi et d'évaluer si
QalioFlex doit évoluer pour rester conforme.

Source officielle surveillée :
https://travail-emploi.gouv.fr/referentiel-national-qualite-guide-de-lecture-qualiopi

## Dernier relevé connu (baseline)

- Date de relevé : 31/07/2026
- Page « Mis à jour le » (affichée sur le site) : 08/01/2024
- Dernière version du guide de lecture référencée : **V.9 du 08/01/2024**
  ("cette version reprend l'ensemble des précisions de la V8 et prend en
  compte les spécificités liées à la sous-traitance")
- PDF en vigueur : « Guide de lecture du référentiel national Qualiopi |
  Janvier 2024 (PDF - 2.52 Mo) »
- Structure du référentiel : 7 critères, reliés à 22 indicateurs communs
  (tronc commun) + 10 indicateurs spécifiques (apprentissage / formations
  certifiantes), soit 32 indicateurs au total.
- Historique des versions listé sur la page (pour mémoire, du plus récent
  au plus ancien avant la baseline) :
  - V.9 du 08/01/2024 — prise en compte de la sous-traitance
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
  jour, et une proposition de points à vérifier dans QalioFlex (contenus
  générés — supports, programmes, émargements, conventions — qui citent
  ou s'appuient sur des indicateurs du référentiel).
- Ce fichier doit alors être mis à jour (nouvelle baseline) après lecture
  par Olivier ou par Claude lors d'une session de suivi.

## Points QalioFlex potentiellement impactés par une évolution du référentiel

À revérifier à chaque changement de version détecté :
- Les modèles de support pédagogique / programme / livret d'accueil
  générés (`documents_formation`) — vocabulaire, mentions obligatoires.
- Le contenu des émargements et attestations.
- Les convention de formation (Chantier 5 — signature DocuSign).
- Tout texte d'aide ou de documentation interne à QalioFlex mentionnant
  des indicateurs precis du référentiel.
