import { Link } from "react-router-dom";
import PageLegale, { H2 } from "@/components/PageLegale";
import { OFFRE, euros } from "@/lib/offre";

// Documentation — refonte du 14/11/2026 : guide par module, aligné sur les
// fonctionnalités réellement en production (inventaire du code au 14/11).

type Module = { id: string; titre: string; pourQui?: string; etapes: string[] };

const MODULES: Module[] = [
  {
    id: "demarrage", titre: "Démarrage",
    etapes: [
      "Inscription par SIRET : les informations de l'organisme sont reprises de l'annuaire officiel des entreprises. Un SIRET déjà inscrit est orienté vers la connexion.",
      "Connexion par email et mot de passe, ou avec un compte Google.",
      `Essai gratuit de ${OFFRE.essaiJours} jours avec enregistrement d'une carte bancaire, sans prélèvement pendant l'essai.`,
      "Mon profil : raison sociale, SIRET, numéro de déclaration d'activité, adresse, logo et couleurs de l'organisme, repris sur vos documents.",
      "La liste de démarrage et l'assistant Qualios vous accompagnent dans les premières étapes.",
    ],
  },
  {
    id: "formations", titre: "Formations",
    etapes: [
      "Création en plusieurs étapes : titre, objectifs, programme, durée, modalités, tarif ; brouillon ou publication.",
      "Création à partir d'un PDF existant : l'IA lit le document et pré-remplit la fiche.",
      "Dépôt du support pédagogique et du programme détaillé, puis génération par l'IA d'une trame pédagogique (déroulé, phases, outils), réservée au formateur.",
      "Génération des compétences visées, et questionnaires de positionnement et d'évaluation proposés par l'IA, à valider.",
      "Archivage automatique des formations publiées non mises à jour depuis le dernier audit de surveillance.",
    ],
  },
  {
    id: "clients", titre: "Clients et sessions",
    etapes: [
      "Création des entreprises clientes et invitation par email à leur espace client.",
      "Création des sessions depuis la fiche client : formation, dates, lieu ; le client transmet la liste de ses stagiaires.",
      "Devis (par session ou générique par formation) et convention de formation pré-remplie, signée en ligne via DocuSign.",
      "Livret d'accueil, émargement électronique, attestation de fin de formation.",
      `Facturation : une session affectée à un client est facturée ${euros(OFFRE.sessionHt, 0)} HT, sauf suppression au moins 48 h avant son démarrage.`,
    ],
  },
  {
    id: "parcours", titre: "Parcours du stagiaire et relances",
    etapes: [
      "Questionnaire de positionnement avant la formation, avec alerte au formateur et au client s'il manque 2 jours avant le début.",
      "Émargement, évaluation à chaud, évaluation des acquis, évaluation à froid et avis sur le formateur, par liens personnels (sans compte).",
      "Relances automatiques des documents en attente à J+2, alerte à J+5 ; bandeau d'alerte sur la liste des stagiaires.",
      "Tableau de bord : actions requises cliquables, menant directement au dossier concerné.",
    ],
  },
  {
    id: "audit", titre: "Qualiopi et audit",
    etapes: [
      "Pré-audit : auto-diagnostic calculé sur vos vraies données, indicateur par indicateur (indicatif, non opposable).",
      "Documents : sélection des sessions contrôlées et complétude documentaire par dossier, imprimable.",
      "Preuve d'audit par session : l'ensemble des pièces et horodatages de la session.",
      "Statut réglementaire : contrôle mensuel automatique du référentiel national qualité.",
    ],
  },
  {
    id: "bpf", titre: "Bilan pédagogique et financier",
    etapes: [
      "Saisie des cadres officiels du BPF (identification, produits, charges, personnes, stagiaires, sous-traitance, dirigeant).",
      "Export PDF à la numérotation Cerfa et guide de saisie sur Mon Activité Formation.",
      "BPF « en cours » modifiable, puis « validé » une fois déclaré. Échéance : 30 avril.",
    ],
  },
  {
    id: "reseau", titre: "Sous-traitance et réputation",
    etapes: [
      "Sous-traitance : confiez une session à un formateur QualioFlex (recherche dans l'annuaire) ou invitez-en un nouveau. Le sous-traitant dispose d'un espace limité à l'animation de la session.",
      "Notations : moyenne, évolution et verbatims des avis de vos stagiaires sur le formateur.",
      "Page d'avis publique et widget à afficher sur votre site ou votre fiche Google.",
    ],
  },
  {
    id: "abonnement", titre: "Abonnement, factures et parrainage",
    etapes: [
      `Abonnement ${euros(OFFRE.abonnementHt)} HT par mois, sessions ${euros(OFFRE.sessionHt, 0)} HT, facture unique le 1er du mois (premier mois au prorata).`,
      "Abonnement et factures : statut, factures en PDF, sessions à facturer, carte bancaire, résiliation (préavis de 30 jours, fin de mois) et annulation de la résiliation.",
      `Impayé : alerte, rappel 2 jours avant la suspension (au bout de ${OFFRE.delaiSuspensionImpayeJours} jours), réactivation immédiate après paiement.`,
      `Parrainage : code et lien d'invitation, un mois offert pour vous et votre filleul, badges Membre Argent (${OFFRE.parrainage.seuilArgent} filleuls) et Membre Or (${OFFRE.parrainage.seuilOr} filleuls), ${OFFRE.parrainage.maxFilleulsParAn} filleuls par an au maximum. Progression affichée sur le tableau de bord.`,
    ],
  },
  {
    id: "compte", titre: "Compte, sécurité et données",
    etapes: [
      "Paramètres : mot de passe, double authentification (application d'authentification), notifications.",
      `Récupération de toutes vos données dans une archive complète pour ${euros(OFFRE.exportHt, 0)} HT, lien envoyé par email.`,
      "Suppression de compte : délai de 30 jours pour changer d'avis, puis suppression définitive.",
      "Assistant Qualios : aide à l'utilisation dans l'application ; les demandes complexes sont transmises au support.",
    ],
  },
];

const Documentation = () => (
  <PageLegale
    titre="Documentation"
    introduction={<p>Ce que fait chaque module de QualioFlex et comment l'utiliser. Pour une question précise, consultez le <Link to="/aide" className="text-exsenco-blue underline">centre d'aide</Link>.</p>}
    sommaire={MODULES.map((m) => ({ id: m.id, titre: m.titre }))}
  >
    {MODULES.map((m) => (
      <section key={m.id}>
        <H2 id={m.id}>{m.titre}</H2>
        <ul>
          {m.etapes.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </section>
    ))}
    <div className="mt-10 text-center">
      <Link to="/contact" className="inline-block rounded-lg px-6 py-2 text-sm font-bold text-white no-underline" style={{ background: "#25245e" }}>Une question ? Contactez-nous</Link>
    </div>
  </PageLegale>
);

export default Documentation;
