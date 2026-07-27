// Base de connaissance QalioFlex — rédigée à partir des fonctionnalités réelles de l'application
// (repo qualiopi-flow-forge). Sert de socle au system prompt du chatbot SAV niveau 1 + on-boarding.
// À tenir à jour à chaque nouvelle fonctionnalité livrée.

export const KNOWLEDGE_BASE = `
# QalioFlex — Base de connaissance

QalioFlex (by ExSenCo) est une application SaaS qui aide les organismes de formation à gérer leur
conformité Qualiopi et leur activité au quotidien : formations, clients, documents obligatoires,
signatures électroniques, bilan pédagogique et financier (BPF), préparation d'audit.

Deux profils utilisateurs :
- **Formateur** (dirigeant/collaborateur d'un organisme de formation) : accède au tableau de bord complet.
- **Client** (entreprise qui a inscrit des salariés à une formation) : accède uniquement à un "Espace client"
  restreint (/espace-client) pour suivre ses sessions et signer/compléter les documents attendus.

## Fonctionnalités côté FORMATEUR

**Tableau de bord (/dashboard)** : vue d'ensemble — nombre de formations publiées, sessions en cours,
relances en attente, indicateurs Qualiopi OK, sessions récentes, satisfaction stagiaires.

**Formations (/formations)** :
- Création d'une formation (/formations/creation) : titre, objectifs, programme, durée, modalités.
- Fiche formation (/formations/:id) : upload du support pédagogique (PDF) et du programme détaillé (PDF).
- **Trame pédagogique générée par IA** : à partir des 2 PDF uploadés (support + programme), l'IA génère
  automatiquement une trame pédagogique complète (déroulé horaire, phases, outils, objectifs) — document
  confidentiel réservé au formateur, pas aux stagiaires/clients.
- Génération automatique de "compétences" liées à la formation.
- Édition d'une formation existante (/formations/:id/edit).

**Clients (/clients)** :
- Liste des clients (entreprises), création d'un nouveau client (raison sociale, SIRET, adresse, contact).
- Fiche client (/clients/:id) : sessions de formation associées, génération de la convention de formation
  (pré-remplie avec les stagiaires), envoi en signature électronique DocuSign (formateur + client),
  invitation du client par email pour qu'il accède à son espace client (/clients → "Inviter").

**Documents (/documents)** — "Préparation d'audit Qualiopi" : centralise les documents et indicateurs
attendus lors d'un audit de certification/surveillance Qualiopi.

**BPF (/bpf)** — Bilan Pédagogique et Financier, déclaration annuelle obligatoire DREETS (Cerfa n°10443*17) :
- Formulaire couvrant les 8 cadres officiels : A (identification organisme), B (période/exercice comptable),
  C (origine des produits, ligne par ligne), D (charges), E (personnes dispensant la formation),
  F (bilan pédagogique détaillé : types de stagiaires, sous-traitance donnée, objectifs des prestations,
  spécialités NSF), G (stagiaires confiés par un autre organisme = sous-traitance reçue), H (dirigeant).
- Export PDF avec numérotation Cerfa exacte + guide pas-à-pas pour recopier sur le portail MAF
  (monactiviteformation.emploi.gouv.fr).
- Un BPF peut être "en cours" (modifiable) puis "validé" (verrouillé) une fois soumis sur MAF.
- Échéance légale : 30 avril de l'année suivante. Un retard peut entraîner la caducité du NDA.

**Signatures électroniques (DocuSign)** : convention de formation envoyée en signature au formateur et au
client (deux zones de signature distinctes sur le même document). Statut visible en temps réel côté
formateur (fiche client) et côté client (espace client).

**Relances automatiques** : un cron quotidien détecte les documents en attente côté client (convention non
signée, émargement non complété, évaluation non remplie...) et envoie une relance email à J+2 puis une
alerte à J+5. Le formateur voit aussi un bandeau d'alerte sur la liste des stagiaires.

**Profil (/profile)** et **Paramètres (/settings)** : informations personnelles, informations organisme
(raison sociale, SIRET, NDA, adresse, logo, couleurs, forme juridique...), sécurité (mot de passe),
notifications email, suppression de compte.

## Fonctionnalités côté CLIENT (Espace client — /espace-client)

Un client (entreprise) accède à son espace après avoir été invité par le formateur (email avec lien
d'invitation, /invitation/:token). Il y retrouve :
- La liste de ses sessions de formation (dates, formation associée, objectifs, programme, durée).
- Les documents à traiter par session : signer la convention de formation (DocuSign), compléter la liste
  des stagiaires, uploader l'émargement, remplir les questionnaires de positionnement (avant/après),
  compléter les évaluations (à chaud en fin de formation, à froid quelques semaines après, évaluation du
  formateur), signer l'attestation de fin de formation, consulter le livret d'accueil.
- Le statut de signature de la convention (en attente / signée) est affiché en direct.

Les questionnaires de positionnement (/positionnement/:token), évaluations (/evaluation/:token) et
émargements (/emargement/:token) sont aussi accessibles via des liens publics envoyés directement aux
stagiaires (pas besoin de compte QalioFlex pour eux).

## Ce que le chatbot ne doit JAMAIS faire

- Donner un avis juridique définitif sur la conformité Qualiopi d'un organisme, ou garantir la réussite
  d'un audit — rediriger vers Olivier ou vers un auditeur/certificateur pour toute question de fond.
- Traiter une demande de facturation, de résiliation d'abonnement ou de remboursement — escalader.
- Demander ou manipuler un mot de passe, une clé API, des coordonnées bancaires.
- Inventer une fonctionnalité qui n'existe pas dans cette base de connaissance.
- Modifier des données (le chatbot ne fait qu'informer et guider, il n'exécute aucune action dans l'app).
`.trim();

// Logique d'on-boarding : étapes attendues selon le profil, utilisées pour personnaliser le message
// d'accueil et les relances proactives du chatbot (sans jamais imposer un parcours rigide).
export const ONBOARDING_STEPS_FORMATEUR = [
  "Compléter le profil de son organisme (raison sociale, SIRET, NDA, adresse, logo) depuis Profil > Organisme",
  "Créer sa première formation (titre, objectifs, programme, durée)",
  "Créer son premier client et l'inviter par email à rejoindre son espace client",
  "Générer une convention de formation et l'envoyer en signature DocuSign",
  "Découvrir le module BPF pour la déclaration annuelle DREETS",
];

export const ONBOARDING_STEPS_CLIENT = [
  "Découvrir ses sessions de formation dans l'espace client",
  "Signer la convention de formation envoyée par le formateur",
  "Compléter la liste des stagiaires pour la session",
  "Savoir où retrouver l'émargement, les évaluations et l'attestation en fin de formation",
];
