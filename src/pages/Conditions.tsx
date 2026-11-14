import { Link } from "react-router-dom";
import PageLegale, { H2, H3 } from "@/components/PageLegale";
import { OFFRE, euros, ttc, CONTACT_EMAIL } from "@/lib/offre";

// Conditions générales d'utilisation et de vente — refonte du 14/11/2026 pour
// intégrer l'offre commerciale (chantier facturation, décisions Olivier du 09
// au 12/11/2026). À faire relire par un conseil juridique avant publication.

const SOMMAIRE = [
  { id: "objet", titre: "Objet et acceptation" },
  { id: "service", titre: "Description du service" },
  { id: "compte", titre: "Compte et sécurité" },
  { id: "beta", titre: "Phase bêta" },
  { id: "offre", titre: "Offre et tarifs" },
  { id: "essai", titre: "Essai gratuit" },
  { id: "sessions", titre: "Sessions facturées" },
  { id: "facturation", titre: "Facturation et paiement" },
  { id: "impayes", titre: "Impayés et suspension" },
  { id: "resiliation", titre: "Durée et résiliation" },
  { id: "donnees-fin", titre: "Récupération des données" },
  { id: "parrainage", titre: "Parrainage" },
  { id: "ambassadeurs", titre: "Comptes ambassadeurs" },
  { id: "evolution-prix", titre: "Évolution des tarifs" },
  { id: "usage", titre: "Utilisation acceptable" },
  { id: "ia", titre: "Contenus générés par l'IA" },
  { id: "qualiopi", titre: "Qualiopi et responsabilités" },
  { id: "disponibilite", titre: "Disponibilité et support" },
  { id: "pi", titre: "Propriété intellectuelle" },
  { id: "rgpd", titre: "Données personnelles" },
  { id: "modifications", titre: "Modification des conditions" },
  { id: "droit", titre: "Droit applicable" },
];

const Conditions = () => {
  const p = OFFRE.parrainage;
  return (
    <PageLegale
      titre="Conditions générales d'utilisation et de vente"
      miseAJour="14 novembre 2026"
      sommaire={SOMMAIRE}
      introduction={
        <p>
          Les présentes conditions générales (les « Conditions ») régissent l'accès à la plateforme QualioFlex et sa
          souscription. Elles s'appliquent à tout utilisateur professionnel, formateur ou organisme de formation
          (le « Client »), ainsi qu'aux entreprises clientes et stagiaires invités par lui, pour la partie qui les concerne.
        </p>
      }
    >
      <H2 id="objet">1. Objet et acceptation</H2>
      <p>
        QualioFlex est édité par <strong>SARL EXSENCO</strong>, 80 rue du Nouveau Bois, 37550 Saint-Avertin, SIRET 892 787 458 00017
        (« ExSenCo »). La création d'un compte vaut acceptation pleine et entière des présentes Conditions. QualioFlex est
        réservé aux professionnels : le Client agit pour les besoins de son activité, le droit de rétractation des
        consommateurs ne s'applique donc pas.
      </p>

      <H2 id="service">2. Description du service</H2>
      <p>QualioFlex est un logiciel en ligne (SaaS) qui aide les organismes de formation à organiser leur activité et à réunir les preuves attendues par le référentiel national qualité (Qualiopi). Il permet notamment :</p>
      <ul>
        <li>la gestion des formations, sessions, entreprises clientes et stagiaires ;</li>
        <li>la génération de documents (devis, conventions, livret d'accueil, émargements, attestations) et leur signature électronique ;</li>
        <li>l'envoi et la relance automatiques des questionnaires de positionnement et des évaluations ;</li>
        <li>le pré-audit Qualiopi, les dossiers de preuve par session et la veille du référentiel ;</li>
        <li>le bilan pédagogique et financier (BPF), la sous-traitance entre formateurs, la notation des formateurs ;</li>
        <li>des fonctions d'intelligence artificielle (trame pédagogique, questionnaires, assistant Qualios).</li>
      </ul>

      <H2 id="compte">3. Compte et sécurité</H2>
      <p>
        L'accès nécessite un compte personnel. Le Client garantit l'exactitude des informations fournies (raison sociale,
        SIRET, numéro de déclaration d'activité) et reste responsable de la confidentialité de ses identifiants. Tout accès
        depuis son compte est réputé effectué par lui. La double authentification est disponible et recommandée.
      </p>

      <H2 id="beta">4. Phase bêta</H2>
      <p>
        Jusqu'à l'ouverture commerciale de QualioFlex, l'accès est gratuit pour les utilisateurs invités à la phase bêta.
        L'ouverture commerciale et l'application des conditions financières ci-dessous sont annoncées à chaque utilisateur
        par email au moins 30 jours à l'avance. Un utilisateur bêta peut alors démarrer son abonnement ou cesser d'utiliser
        le service et récupérer ses données.
      </p>

      <H2 id="offre">5. Offre et tarifs</H2>
      <p>QualioFlex est proposé selon une formule unique comprenant l'ensemble des fonctionnalités :</p>
      <ul>
        <li><strong>Abonnement mensuel : {euros(OFFRE.abonnementHt)} HT</strong>, soit {euros(ttc(OFFRE.abonnementHt))} TTC ;</li>
        <li><strong>Session facturée : {euros(OFFRE.sessionHt)} HT</strong> par session, dans les conditions de l'article 7 ;</li>
        <li><strong>Récupération des données : {euros(OFFRE.exportHt)} HT</strong>, prestation facultative décrite à l'article 11.</li>
      </ul>
      <p>Les prix sont exprimés en euros hors taxes ; la TVA française au taux en vigueur (20 %) s'y ajoute. Le service est proposé aux professionnels établis en France.</p>

      <H2 id="essai">6. Essai gratuit</H2>
      <p>
        Chaque nouvel organisme bénéficie d'un essai gratuit de <strong>{OFFRE.essaiJours} jours</strong>, sans limitation de
        fonctionnalités. L'enregistrement d'une carte bancaire est demandé au démarrage de l'essai ; aucun prélèvement n'est
        effectué pendant l'essai. Un email de rappel est envoyé avant son terme. Sans résiliation, l'abonnement payant démarre
        automatiquement à la fin de l'essai.
      </p>
      <p>Les sessions qui deviennent facturables pendant l'essai (article 7) figurent sur la première facture.</p>

      <H2 id="sessions">7. Sessions facturées</H2>
      <p>
        Une session devient facturable dès qu'elle est <strong>créée et affectée à une entreprise cliente</strong>. Elle est
        due 48 heures avant sa date de début, ou au moment de son affectation si celle-ci intervient moins de 48 heures avant
        le début.
      </p>
      <ul>
        <li>Une session supprimée ou annulée <strong>au moins 48 heures avant son démarrage</strong> n'est pas facturée.</li>
        <li>Une session supprimée ou annulée moins de 48 heures avant son démarrage reste facturée.</li>
        <li>La session est facturée à l'organisme qui détient la formation (donneur d'ordre), y compris lorsqu'elle est animée par un formateur sous-traitant.</li>
        <li>Les sessions dues au cours d'un mois sont regroupées sur la facture du 1<sup>er</sup> du mois suivant.</li>
      </ul>
      <p>La page « Abonnement et factures » indique à tout moment les sessions à facturer et, lors d'une suppression, si celle-ci est gratuite ou facturée.</p>

      <H2 id="facturation">8. Facturation et paiement</H2>
      <ul>
        <li>L'abonnement est payable d'avance par carte bancaire, par prélèvement automatique le 1<sup>er</sup> de chaque mois. Le premier mois est facturé au prorata des jours restants.</li>
        <li>Une facture unique est émise chaque mois ; elle regroupe l'abonnement, les sessions dues et, le cas échéant, les mois offerts. Toutes les factures sont téléchargeables dans l'espace « Abonnement et factures ».</li>
        <li>Les paiements sont traités par <strong>Stripe</strong>, prestataire de paiement agréé. ExSenCo n'a jamais accès aux numéros de carte. Le Client peut mettre à jour sa carte à tout moment depuis son espace.</li>
        <li>La facturation électronique sera mise en œuvre selon le calendrier réglementaire applicable.</li>
      </ul>

      <H2 id="impayes">9. Impayés et suspension</H2>
      <p>En cas d'échec de paiement (carte refusée, expirée ou plafond atteint) :</p>
      <ul>
        <li>le Client est averti par email que son accès sera suspendu sous <strong>{OFFRE.delaiSuspensionImpayeJours} jours</strong> sans régularisation ;</li>
        <li>une relance lui est adressée 2 jours avant la suspension ;</li>
        <li>à l'échéance, l'accès est suspendu : seule la page « Abonnement et factures » reste accessible. <strong>Les données sont conservées</strong> ;</li>
        <li>l'accès est rétabli dès le paiement de la facture en attente, après mise à jour du moyen de paiement.</li>
      </ul>
      <p>Un email prévient aussi le Client lorsque sa carte arrive à expiration avant le prochain prélèvement.</p>

      <H2 id="resiliation">10. Durée et résiliation</H2>
      <p>
        L'abonnement est <strong>sans engagement de durée</strong> et se renouvelle chaque mois. Le Client peut le résilier à
        tout moment depuis son espace, avec un <strong>préavis de {OFFRE.preavisJours} jours</strong> : l'abonnement prend fin le dernier
        jour du mois atteint à l'issue du préavis (exemple : une demande le 12 novembre prend effet le 31 décembre). Le Client
        conserve un accès complet jusqu'à cette date et peut annuler sa résiliation tant qu'elle n'a pas pris effet.
      </p>
      <p>
        À la fin de l'abonnement, les sessions devenues facturables et non encore facturées font l'objet d'une dernière
        facture ; les sessions prévues après la fin de l'abonnement ne sont pas facturées. Aucun remboursement au prorata
        n'est effectué pour le mois en cours.
      </p>
      <p>
        ExSenCo peut suspendre ou résilier un compte en cas de manquement grave aux présentes Conditions, après mise en
        demeure restée sans effet pendant 15 jours, sauf urgence (atteinte à la sécurité, usage illicite).
      </p>

      <H2 id="donnees-fin">11. Récupération des données</H2>
      <p>
        Le Client peut obtenir à tout moment, et notamment lors d'une résiliation ou d'une suppression de compte, une archive
        complète de ses données (formations, sessions, clients, stagiaires, documents, conventions signées, preuves d'audit)
        au prix de <strong>{euros(OFFRE.exportHt)} HT</strong>, payable par carte. L'archive est envoyée par email via un lien de
        téléchargement valable 30 jours. Les droits d'accès et de portabilité prévus par le RGPD restent exerçables
        gratuitement selon les modalités de la <Link to="/confidentialite">politique de confidentialité</Link>.
      </p>

      <H2 id="parrainage">12. Parrainage</H2>
      <p>Tout abonné peut recommander QualioFlex à d'autres professionnels grâce à son code ou à son lien de parrainage.</p>
      <ul>
        <li>Le filleul saisit le code au démarrage de son essai. Le parrainage est réservé aux organismes n'ayant jamais été abonnés ; le code d'un parrain ne peut pas être utilisé par son propre organisme.</li>
        <li>Le parrainage est <strong>confirmé lorsque le filleul règle sa première facture</strong>. Le parrain et le filleul reçoivent alors chacun <strong>un mois d'abonnement offert</strong>.</li>
        <li>Un mois offert est déduit de la prochaine facture portant sur un mois d'abonnement complet. Il porte sur l'abonnement uniquement ; les sessions restent facturées. Les mois offerts n'ont pas de valeur monétaire et ne sont ni remboursables ni cessibles.</li>
        <li>Un parrain peut parrainer au maximum <strong>{p.maxFilleulsParAn} filleuls par année civile</strong>.</li>
        <li><strong>Badge Membre Argent</strong> : à {p.seuilArgent} filleuls confirmés, le parrain reçoit un mois d'abonnement offert supplémentaire.</li>
        <li><strong>Badge Membre Or</strong> : à {p.seuilOr} filleuls confirmés, toutes les sessions du parrain sont offertes pendant {p.dureeSessionsOffertesMois} mois à compter de l'obtention du badge ; seul l'abonnement reste facturé. Pendant cette période, le parrain ne peut pas parrainer de nouveaux filleuls.</li>
        <li>ExSenCo peut, à titre commercial, accorder des mois offerts à un abonné, dans la limite de deux par an.</li>
        <li>En cas de fraude ou d'abus (comptes fictifs, auto-parrainage), ExSenCo peut annuler les avantages obtenus.</li>
      </ul>

      <H2 id="ambassadeurs">13. Comptes ambassadeurs</H2>
      <p>
        ExSenCo peut attribuer le statut d'ambassadeur à certains utilisateurs, notamment ses bêta-testeurs. Un compte
        ambassadeur n'est pas facturé (abonnement et sessions) tant que ce statut lui est attribué. Le retrait du statut est
        notifié par email au moins 30 jours à l'avance.
      </p>

      <H2 id="evolution-prix">14. Évolution des tarifs</H2>
      <p>
        ExSenCo peut faire évoluer ses tarifs. Toute modification applicable aux abonnements en cours est notifiée par email
        au moins 30 jours avant son entrée en vigueur ; le Client peut résilier son abonnement avant cette date. Les nouveaux
        tarifs s'appliquent immédiatement aux nouvelles souscriptions.
      </p>

      <H2 id="usage">15. Utilisation acceptable</H2>
      <p>
        Le Client utilise QualioFlex pour des finalités licites et professionnelles. Sont notamment interdits : la saisie de
        contenus illicites, toute tentative d'intrusion ou de contournement des mesures de sécurité, l'extraction massive de
        données, la revente ou la mise à disposition du service à des tiers non autorisés.
      </p>

      <H2 id="ia">16. Contenus générés par l'intelligence artificielle</H2>
      <p>
        Certaines fonctions (trame pédagogique, questionnaires, compétences, devis, livret, assistant Qualios) s'appuient sur
        un modèle d'intelligence artificielle (Claude, d'Anthropic). Les contenus proposés sont des suggestions : le Client
        doit les relire, les adapter et les valider avant tout usage. Il reste seul responsable des documents qu'il diffuse.
        L'assistant Qualios fournit une aide à l'utilisation et ne délivre ni conseil juridique ni avis de conformité.
      </p>

      <H2 id="qualiopi">17. Qualiopi et responsabilités</H2>
      <p>
        QualioFlex aide le Client à produire, organiser et retrouver les preuves attendues par le référentiel national qualité.
        Il ne constitue pas une certification et ne garantit pas l'obtention ou le maintien de la certification Qualiopi,
        qui relève exclusivement d'un organisme certificateur accrédité. Le pré-audit est un auto-diagnostic indicatif.
      </p>
      <p>
        Le Client reste responsable des données qu'il saisit, de leur exactitude et de leur conformité aux réglementations
        applicables (formation professionnelle, RGPD, BPF). La responsabilité d'ExSenCo est limitée aux dommages directs et
        prouvés, dans la limite des sommes versées par le Client au titre des douze derniers mois. ExSenCo n'est pas
        responsable des dommages indirects (perte de chiffre d'affaires, de clientèle ou de certification).
      </p>

      <H2 id="disponibilite">18. Disponibilité et support</H2>
      <p>
        ExSenCo s'efforce de maintenir QualioFlex accessible 24 h/24, 7 j/7, hors maintenances, pannes des prestataires
        techniques et cas de force majeure ; aucune disponibilité absolue n'est garantie. Le support est assuré par
        l'assistant Qualios, le <Link to="/contact">formulaire de contact</Link> et par email à {CONTACT_EMAIL}, les jours ouvrés.
      </p>

      <H2 id="pi">19. Propriété intellectuelle</H2>
      <p>
        La plateforme, son code, son interface, ses textes et la marque QualioFlex sont la propriété d'ExSenCo. Le Client
        dispose d'un droit d'utilisation personnel et non exclusif pendant la durée de son abonnement. Le Client reste
        propriétaire des données et documents qu'il dépose ou génère dans QualioFlex.
      </p>

      <H2 id="rgpd">20. Données personnelles</H2>
      <p>
        Pour les données de ses stagiaires et de ses clients, le Client est responsable de traitement et ExSenCo agit en
        qualité de sous-traitant au sens du RGPD. Les engagements d'ExSenCo en tant que sous-traitant, la liste de ses propres
        sous-traitants et les durées de conservation figurent dans la <Link to="/confidentialite">politique de
        confidentialité</Link> et la page <Link to="/rgpd">RGPD</Link>, qui font partie intégrante des présentes Conditions.
      </p>

      <H2 id="modifications">21. Modification des conditions</H2>
      <p>
        ExSenCo peut modifier les présentes Conditions. Les modifications substantielles sont notifiées par email au moins
        30 jours avant leur entrée en vigueur ; la poursuite de l'utilisation vaut acceptation. En cas de désaccord, le
        Client peut résilier son abonnement avant cette date.
      </p>

      <H2 id="droit">22. Droit applicable et litiges</H2>
      <p>
        Les présentes Conditions sont soumises au droit français. Les parties recherchent d'abord une solution amiable. À
        défaut, tout litige relève de la compétence exclusive des tribunaux de Tours.
      </p>
      <H3>Contact</H3>
      <p>SARL EXSENCO — 80 rue du Nouveau Bois, 37550 Saint-Avertin — {CONTACT_EMAIL}</p>
    </PageLegale>
  );
};

export default Conditions;
