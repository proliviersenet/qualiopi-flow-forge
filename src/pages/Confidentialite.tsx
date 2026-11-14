import { Link } from "react-router-dom";
import PageLegale, { H2, H3 } from "@/components/PageLegale";
import { SOUS_TRAITANTS } from "@/lib/sousTraitants";
import { CONTACT_EMAIL } from "@/lib/offre";

// Politique de confidentialité — refonte du 14/11/2026 : abonnement et paiement
// (Stripe), parrainage, IA (Anthropic), emails (Brevo, Resend), signature
// (DocuSign), connexion Google, durées de conservation, transferts hors UE.
// À faire relire par un conseil juridique avant publication.

const SOMMAIRE = [
  { id: "responsable", titre: "Responsable du traitement" },
  { id: "roles", titre: "Nos deux rôles" },
  { id: "donnees", titre: "Données collectées" },
  { id: "finalites", titre: "Finalités et bases légales" },
  { id: "conservation", titre: "Durées de conservation" },
  { id: "destinataires", titre: "Destinataires et sous-traitants" },
  { id: "transferts", titre: "Transferts hors Union européenne" },
  { id: "securite", titre: "Sécurité" },
  { id: "stockage", titre: "Cookies et stockage local" },
  { id: "droits", titre: "Vos droits" },
];

const Ligne = ({ f, b }: { f: string; b: string }) => (
  <tr className="border-b border-gray-100 align-top"><td className="py-2 pr-4">{f}</td><td className="py-2 text-gray-600">{b}</td></tr>
);

const Confidentialite = () => (
  <PageLegale titre="Politique de confidentialité" miseAJour="14 novembre 2026" sommaire={SOMMAIRE}>
    <H2 id="responsable">1. Responsable du traitement</H2>
    <p>
      QualioFlex est édité par <strong>SARL EXSENCO</strong>, 80 rue du Nouveau Bois, 37550 Saint-Avertin, SIRET 892 787 458 00017.
      Référent données personnelles : Olivier Senet, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
    </p>

    <H2 id="roles">2. Nos deux rôles</H2>
    <ul>
      <li><strong>Responsable de traitement</strong> pour les données de nos abonnés (formateurs, organismes de formation) : compte, abonnement, facturation, parrainage, support.</li>
      <li><strong>Sous-traitant</strong> pour les données que nos abonnés saisissent sur leurs entreprises clientes et leurs stagiaires. L'abonné reste responsable de ce traitement et de l'information de ses stagiaires ; nous traitons ces données uniquement sur ses instructions, pour fournir le service. Le détail figure sur la page <Link to="/rgpd">RGPD</Link>.</li>
    </ul>

    <H2 id="donnees">3. Données collectées</H2>
    <ul>
      <li><strong>Identification</strong> : nom, prénom, email, téléphone.</li>
      <li><strong>Organisme</strong> : raison sociale, SIRET, numéro de déclaration d'activité, adresse, logo. Le SIRET est vérifié auprès de l'annuaire public des entreprises (API Recherche d'entreprises de l'État).</li>
      <li><strong>Activité de formation</strong> : formations, sessions, entreprises clientes, stagiaires, documents, émargements, évaluations, BPF.</li>
      <li><strong>Abonnement</strong> : statut, factures, sessions facturées, mois offerts, parrainages. Les données de carte bancaire sont collectées et conservées par Stripe ; nous ne voyons que la marque, les 4 derniers chiffres et la date d'expiration.</li>
      <li><strong>Assistance</strong> : conversations avec l'assistant Qualios, messages envoyés au support.</li>
      <li><strong>Connexion et sécurité</strong> : adresse IP, journaux d'accès, journal des modifications des données sensibles, double authentification.</li>
    </ul>

    <H2 id="finalites">4. Finalités et bases légales</H2>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left border-b border-gray-200"><th className="py-2 pr-4">Finalité</th><th className="py-2">Base légale</th></tr></thead>
        <tbody>
          <Ligne f="Fournir le service, gérer votre compte, envoyer les documents et relances" b="Exécution du contrat" />
          <Ligne f="Gérer l'essai, l'abonnement, les paiements, les impayés et la facturation" b="Exécution du contrat" />
          <Ligne f="Conserver les factures et pièces comptables" b="Obligation légale (Code de commerce)" />
          <Ligne f="Programme de parrainage (codes, mois offerts, badges)" b="Exécution du contrat" />
          <Ligne f="Emails d'information sur le parrainage et les nouveautés aux abonnés" b="Intérêt légitime (vous pouvez vous y opposer à tout moment)" />
          <Ligne f="Fonctions d'intelligence artificielle et assistant Qualios" b="Exécution du contrat" />
          <Ligne f="Sécurité, prévention de la fraude, journal des modifications" b="Intérêt légitime" />
          <Ligne f="Répondre à vos demandes de support" b="Exécution du contrat ou intérêt légitime" />
        </tbody>
      </table>
    </div>
    <p className="text-sm text-gray-500">Nous ne vendons aucune donnée et n'effectuons aucune publicité ciblée.</p>

    <H2 id="conservation">5. Durées de conservation</H2>
    <ul>
      <li><strong>Données du compte et d'activité</strong> : pendant toute la durée de l'abonnement, puis 3 ans après sa fin, afin de permettre la réactivation du compte et la récupération des preuves Qualiopi, sauf demande de suppression.</li>
      <li><strong>Suppression de compte</strong> : après votre demande, les données sont conservées 30 jours (délai pendant lequel vous pouvez changer d'avis), puis supprimées définitivement.</li>
      <li><strong>Factures et données de facturation</strong> : 10 ans, conformément au Code de commerce, y compris après la suppression du compte.</li>
      <li><strong>Archive de récupération des données</strong> : lien de téléchargement valable 30 jours.</li>
      <li><strong>Journaux de connexion</strong> : 12 mois au maximum.</li>
    </ul>

    <H2 id="destinataires">6. Destinataires et sous-traitants</H2>
    <p>Vos données sont accessibles à ExSenCo pour les besoins du service et du support, ainsi qu'aux prestataires techniques suivants, liés par contrat :</p>
    <div className="space-y-3 mt-3">
      {SOUS_TRAITANTS.map((s) => (
        <div key={s.nom} className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <p className="font-semibold text-gray-900">{s.nom} <span className="font-normal text-gray-500">· {s.usage}</span></p>
          <p className="mt-1 text-gray-600">Données : {s.donnees}</p>
          <p className="text-gray-600">Localisation : {s.localisation}</p>
          <p className="text-gray-600">Garanties : {s.garanties} · <a href={s.lien} target="_blank" rel="noopener noreferrer">politique de confidentialité</a></p>
        </div>
      ))}
    </div>
    <p className="mt-3">Les entreprises clientes et stagiaires que vous invitez accèdent uniquement aux informations de leurs propres sessions.</p>

    <H2 id="transferts">7. Transferts hors Union européenne</H2>
    <p>
      La base de données est hébergée dans l'Union européenne. Certains prestataires (Vercel, Stripe, Resend, Anthropic,
      Google) peuvent traiter des données aux États-Unis. Ces transferts sont encadrés par les clauses contractuelles types
      de la Commission européenne et, le cas échéant, par le Data Privacy Framework UE–États-Unis.
    </p>

    <H2 id="securite">8. Sécurité</H2>
    <ul>
      <li>Échanges chiffrés (HTTPS/TLS), mots de passe hachés, double authentification disponible.</li>
      <li>Cloisonnement des données par organisme, contrôlé au niveau de la base de données.</li>
      <li>Journal des modifications des données sensibles, accessible uniquement à l'administrateur.</li>
      <li>Liens publics (émargement, évaluations) à jeton unique, sans accès au reste du compte.</li>
    </ul>

    <H2 id="stockage">9. Cookies et stockage local</H2>
    <p>
      QualioFlex n'utilise <strong>aucun cookie publicitaire ni outil de mesure d'audience</strong>. Seuls des éléments
      strictement nécessaires sont enregistrés dans votre navigateur : session de connexion, conversation en cours avec
      Qualios, code de parrainage reçu par lien, préférences d'affichage. Ils ne nécessitent pas de consentement. Les polices
      de caractères sont hébergées sur nos propres serveurs.
    </p>

    <H2 id="droits">10. Vos droits</H2>
    <p>Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, de portabilité et d'opposition, ainsi que du droit de définir des directives sur le sort de vos données après votre décès.</p>
    <ul>
      <li>La plupart des informations se modifient directement depuis votre profil.</li>
      <li>Pour exercer vos droits : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Nous répondons sous un mois.</li>
      <li>Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">www.cnil.fr/fr/plaintes</a>.</li>
    </ul>
    <H3>Vous êtes stagiaire ou entreprise cliente ?</H3>
    <p>Adressez d'abord votre demande à l'organisme de formation qui vous a invité : il est responsable du traitement de vos données. Nous l'aiderons à y répondre.</p>
  </PageLegale>
);

export default Confidentialite;
