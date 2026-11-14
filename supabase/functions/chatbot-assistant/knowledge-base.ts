// Base de connaissance QualioFlex — rédigée à partir des fonctionnalités réelles de l'application
// (repo qualiopi-flow-forge). Sert de socle au system prompt du chatbot SAV niveau 1 + on-boarding.
// À tenir à jour à chaque nouvelle fonctionnalité livrée.
// Mise à jour complète du 14/11/2026 : abonnement, facturation des sessions, impayés, résiliation,
// export des données, parrainage et badges, pré-audit, sous-traitance, notations, 2FA.
// Les montants doivent rester alignés sur src/lib/offre.ts et la table public.tarifs.

export const KNOWLEDGE_BASE = `
# QualioFlex — Base de connaissance

QualioFlex (édité par SARL EXSENCO, cabinet d'Olivier Senet à Saint-Avertin) est un logiciel SaaS qui aide
les formateurs et organismes de formation à gérer leur activité et à réunir les preuves attendues par le
référentiel national qualité (Qualiopi) : formations, clients, sessions, documents obligatoires, signatures
électroniques, relances, BPF, pré-audit et dossiers de preuve.

Profils :
- **Formateur** (dirigeant ou collaborateur d'un organisme de formation) : accès complet.
- **Client** (entreprise qui inscrit des salariés) : "Espace client" restreint (/espace-client).
- **Stagiaires** : pas de compte, ils reçoivent des liens personnels.
- **Sous-traitant** : formateur QualioFlex à qui un autre organisme confie l'animation d'une session.

## Offre et abonnement

- Abonnement unique : **34,90 € HT par mois** (41,88 € TTC), toutes fonctionnalités incluses.
- **3 € HT par session facturée.**
- **Essai gratuit de 7 jours** : carte bancaire enregistrée au démarrage (page Stripe sécurisée), aucun
  prélèvement pendant l'essai, aucune limite de fonctionnalités. Bandeau "jours restants" en haut de l'app,
  email de rappel avant la fin. Sans résiliation, l'abonnement démarre automatiquement.
- **Facture unique le 1er de chaque mois** : abonnement + sessions dues le mois précédent ; le premier mois
  après l'essai est au prorata. TVA 20 %. Clients en France uniquement.
- Factures téléchargeables : menu avatar → **"Abonnement et factures"** (/factures). Cette page montre aussi
  le statut de l'abonnement et les "Sessions à facturer" du mois.
- Changer de carte : Abonnement et factures → "Gérer ma carte bancaire" (portail Stripe).
- Phase bêta : tant que la facturation n'est pas ouverte, QualioFlex est gratuit pour les bêta-testeurs ;
  l'ouverture commerciale est annoncée par email au moins 30 jours avant.
- Comptes "ambassadeurs" (statut attribué par ExSenCo) : jamais facturés.

### Sessions facturées
- Une session est facturable dès qu'elle est **créée et affectée à un client**.
- Elle devient due **48 h avant son démarrage** (ou à l'affectation si moins de 48 h avant).
- **Supprimée ou annulée au moins 48 h avant le début : gratuite.** Moins de 48 h avant : reste facturée.
  La fenêtre de suppression d'une session l'indique (message vert "gratuite" ou orange "reste facturée").
- En sous-traitance, c'est l'organisme qui détient la formation (donneur d'ordre) qui paie la session.
- Les sessions créées pendant l'essai figurent sur la première facture.

### Impayés
- Paiement refusé ou carte expirée : email d'alerte, accès **suspendu au bout de 10 jours** sans
  régularisation, rappel 2 jours avant. Les données sont conservées.
- Pendant la suspension, seule la page Abonnement et factures est accessible : boutons "Régler la facture en
  ligne", "Mettre à jour ma carte" et "Réessayer le paiement". L'accès est rétabli dès le paiement.
- Un email prévient aussi quand la carte expire avant le prochain prélèvement.

### Résiliation
- Sans engagement. Abonnement et factures → "Résilier mon abonnement".
- **Préavis de 30 jours, effet le dernier jour du mois atteint** (ex. : demande le 12/11 → fin le 31/12). La
  date exacte est affichée avant confirmation. Accès complet jusqu'à cette date.
- La résiliation peut être annulée avant sa date d'effet ("Annuler la résiliation").
- À la fin : dernière facture des sessions dues non facturées ; les sessions prévues après la fin ne sont
  pas facturées. Pas de remboursement au prorata du mois en cours.

### Récupération des données
- Archive complète (formations, sessions, clients, stagiaires, documents, conventions signées DocuSign,
  preuves d'audit) pour **10 € HT** (12 € TTC), payée par carte. Proposée lors d'une résiliation (Abonnement et
  factures → "Récupérer mes données") ou d'une suppression de compte (Paramètres). Lien de téléchargement
  envoyé par email, valable 30 jours.
- Suppression de compte : Paramètres → "Supprimer mon compte" ; données conservées 30 jours (on peut changer
  d'avis en contactant le support), puis suppression définitive. Les factures sont gardées 10 ans (loi).

## Parrainage
- Code et lien d'invitation (qualioflex.fr/register?parrain=CODE) visibles sur le **tableau de bord** (carte
  parrainage avec progression et badge) et dans Abonnement et factures.
- Le filleul s'inscrit avec le lien (code appliqué automatiquement) ou saisit le code au démarrage de son
  essai. Réservé aux organismes jamais abonnés ; impossible d'utiliser son propre code.
- Parrainage **confirmé quand le filleul paie sa première facture** : **1 mois offert au parrain + 1 mois offert
  au filleul**.
- Le mois offert est déduit automatiquement de la prochaine facture portant sur un mois complet d'abonnement
  (pas sur une facture au prorata) ; les sessions restent facturées.
- **Maximum 5 filleuls par parrain et par année civile.**
- **Badge Membre Argent** à 3 filleuls confirmés : +1 mois offert en bonus.
- **Badge Membre Or** à 5 filleuls confirmés : toutes ses sessions offertes pendant 12 mois (l'abonnement
  reste facturé) ; pendant cette période, le parrainage du Membre Or est en pause.
- Une relance mensuelle (le 10 du mois) rappelle aux abonnés leur progression ou ce qu'ils peuvent gagner.

## Fonctionnalités côté FORMATEUR

**Inscription** : par SIRET (infos reprises de l'annuaire officiel des entreprises ; un SIRET déjà inscrit est
orienté vers la connexion), ou connexion avec Google. Double authentification disponible.

**Tableau de bord (/dashboard)** : indicateurs, sessions récentes, badge "Actions requises" cliquable qui mène
au dossier concerné, liste de démarrage, carte parrainage.

**Formations (/formations)** :
- Création (/formations/creation), y compris à partir d'un PDF existant analysé par l'IA.
- Fiche formation : dépôt du support et du programme (PDF) → **trame pédagogique générée par IA** (réservée au
  formateur), compétences générées, devis générique par formation.
- Les formations publiées non mises à jour depuis le dernier audit de surveillance sont archivées
  automatiquement.

**Clients (/clients)** : création d'entreprises clientes, invitation à l'espace client. Fiche client
(/clients/:id) : sessions (formation, dates), devis, convention pré-remplie avec les stagiaires, envoi en
signature **DocuSign** (formateur puis client), livret d'accueil, émargement, attestation, bouton
"Sous-traiter" une session.

**Parcours stagiaire et relances automatiques** : positionnement avant formation (alerte formateur + client
s'il manque 2 jours avant), émargement, évaluations à chaud, des acquis, à froid et du formateur, attestation.
Relance des documents en attente à J+2, alerte à J+5, bandeau d'alerte sur la liste des stagiaires.

**Documents (/documents)** — préparation d'audit : sélection des sessions contrôlées, complétude documentaire
par dossier, imprimable. **Preuve d'audit** par session (/session/:id/preuve-audit).

**Pré-audit Qualiopi (/pre-audit, menu avatar)** : auto-diagnostic calculé sur les vraies données de
l'organisme ; indicatif, non opposable, ne remplace pas un audit.

**Statut réglementaire (/qualiopi-statut, menu avatar)** : résultat du contrôle mensuel automatique du
référentiel national qualité.

**BPF (/bpf)** : Bilan pédagogique et financier (Cerfa 10443), cadres officiels A à H, export PDF numéroté +
guide de saisie sur Mon Activité Formation. "En cours" puis "validé". Échéance : 30 avril de l'année suivante.

**Sous-traitance** : confier une session à un formateur QualioFlex (recherche dans l'annuaire) ou en inviter un
nouveau ; le sous-traitant a un espace limité à l'animation (/sessions-sous-traitees/:id).

**Notations (/notations-formateur)** : moyenne, évolution, verbatims des avis stagiaires ; page d'avis publique
(/avis/:organismeId) et widget à intégrer sur un site.

**Profil (/profile) et Paramètres (/settings)** : infos personnelles et organisme (raison sociale, SIRET, NDA,
adresse, logo, couleurs), mot de passe, double authentification (Paramètres → Sécurité), notifications,
suppression de compte.

## Fonctionnalités côté CLIENT (/espace-client)
Accès après invitation du formateur (/invitation/:token). Le client voit uniquement ses sessions : convention à
signer (statut DocuSign en direct), liste des stagiaires à compléter, émargements, positionnement, évaluations,
attestation, livret d'accueil. Les stagiaires utilisent des liens publics personnels (/positionnement,
/evaluation, /emargement, /livret, /attestation) sans compte.

## Données et sécurité
Base de données hébergée dans l'UE (Francfort). Paiements par Stripe (QualioFlex ne voit jamais le numéro de
carte). Pas de cookie publicitaire ni de mesure d'audience. Pour les données des stagiaires, le formateur est
responsable de traitement et ExSenCo sous-traitant. Détails : pages /confidentialite et /rgpd. CGUV : /conditions.

## Ce que le chatbot ne doit JAMAIS faire
- Garantir la certification Qualiopi ou la réussite d'un audit, ou donner un avis juridique définitif —
  rappeler que seul un organisme certificateur délivre la certification, et escalader les questions de fond.
- Traiter lui-même un remboursement, un geste commercial, une contestation de facture, une erreur de facturation
  ou une demande d'exception aux règles (mois offert, session facturée à tort...) — expliquer la règle puis
  escalader. Il PEUT expliquer les tarifs, l'essai, la facturation des sessions, la résiliation et le parrainage.
- Demander ou manipuler un mot de passe, une clé API, des coordonnées bancaires.
- Inventer une fonctionnalité, un tarif ou une règle absents de cette base.
- Modifier des données (le chatbot informe et guide, il n'exécute aucune action dans l'app).
`.trim();

// Logique d'on-boarding : étapes attendues selon le profil, utilisées pour personnaliser le message
// d'accueil et les relances proactives du chatbot (sans jamais imposer un parcours rigide).
export const ONBOARDING_STEPS_FORMATEUR = [
  "Compléter le profil de son organisme (raison sociale, SIRET, NDA, adresse, logo) depuis Mon profil",
  "Créer sa première formation (titre, objectifs, programme, durée), éventuellement à partir d'un PDF",
  "Créer son premier client, y ajouter une session et l'inviter à rejoindre son espace client",
  "Générer la convention de formation et l'envoyer en signature DocuSign",
  "Découvrir le pré-audit Qualiopi et le module BPF",
  "Partager son lien de parrainage pour gagner des mois offerts",
];

export const ONBOARDING_STEPS_CLIENT = [
  "Découvrir ses sessions de formation dans l'espace client",
  "Signer la convention de formation envoyée par le formateur",
  "Compléter la liste des stagiaires pour la session",
  "Savoir où retrouver l'émargement, les évaluations et l'attestation en fin de formation",
];
