// Prestataires techniques qui traitent des données pour QualioFlex (sous-traitants
// au sens du RGPD). Liste établie le 14/11/2026 à partir des appels réellement
// présents dans le code (fonctions serveur et application). À tenir à jour à
// chaque nouveau service branché. Affichée dans /confidentialite et /rgpd.

export type SousTraitant = {
  nom: string;
  usage: string;
  donnees: string;
  localisation: string;
  garanties: string;
  lien: string;
};

export const SOUS_TRAITANTS: SousTraitant[] = [
  {
    nom: "Supabase",
    usage: "Base de données, authentification, stockage des fichiers, fonctions serveur",
    donnees: "Toutes les données de l'application",
    localisation: "Union européenne (Francfort)",
    garanties: "Hébergement UE ; clauses contractuelles types pour l'éditeur américain",
    lien: "https://supabase.com/privacy",
  },
  {
    nom: "Vercel",
    usage: "Hébergement et diffusion de l'application web",
    donnees: "Données techniques de connexion (adresse IP, navigateur)",
    localisation: "Réseau mondial, société établie aux États-Unis",
    garanties: "Clauses contractuelles types, Data Privacy Framework",
    lien: "https://vercel.com/legal/privacy-policy",
  },
  {
    nom: "Stripe",
    usage: "Paiement par carte, abonnement, factures",
    donnees: "Identité de facturation, email, moyen de paiement (jamais visible par QualioFlex)",
    localisation: "Union européenne (Irlande), transferts encadrés vers les États-Unis",
    garanties: "Prestataire agréé, certifié PCI-DSS ; clauses contractuelles types",
    lien: "https://stripe.com/fr/privacy",
  },
  {
    nom: "DocuSign",
    usage: "Signature électronique des conventions",
    donnees: "Nom, email des signataires, document signé",
    localisation: "Plateforme européenne de DocuSign",
    garanties: "Règles d'entreprise contraignantes (BCR), clauses contractuelles types",
    lien: "https://www.docusign.com/fr-fr/societe/confidentialite",
  },
  {
    nom: "Brevo",
    usage: "Emails transactionnels (relances, notifications, factures, abonnement)",
    donnees: "Email, nom, contenu des messages",
    localisation: "France / Union européenne",
    garanties: "Société française, hébergement UE",
    lien: "https://www.brevo.com/fr/legal/privacypolicy/",
  },
  {
    nom: "Resend",
    usage: "Certains emails (invitations, notifications de sous-traitance, suppression de compte)",
    donnees: "Email, nom, contenu des messages",
    localisation: "États-Unis",
    garanties: "Clauses contractuelles types",
    lien: "https://resend.com/legal/privacy-policy",
  },
  {
    nom: "Anthropic (Claude)",
    usage: "Fonctions d'intelligence artificielle : trame pédagogique, questionnaires, compétences, devis, livret, assistant Qualios",
    donnees: "Contenus de formation transmis (textes, PDF), questions posées à l'assistant",
    localisation: "États-Unis",
    garanties: "Clauses contractuelles types ; données de l'API non utilisées pour entraîner les modèles",
    lien: "https://www.anthropic.com/legal/privacy",
  },
  {
    nom: "Google",
    usage: "Connexion avec un compte Google (facultative)",
    donnees: "Nom, email, identifiant Google",
    localisation: "Union européenne / États-Unis",
    garanties: "Data Privacy Framework, clauses contractuelles types",
    lien: "https://policies.google.com/privacy?hl=fr",
  },
];
