import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageLegale, { H2 } from "@/components/PageLegale";
import { OFFRE, euros, ttc } from "@/lib/offre";

// Centre d'aide (FAQ) — refonte du 14/11/2026 : questions classées par thème,
// recherche, abonnement / sessions / parrainage / données. Contenu aligné sur
// les CGUV et sur la base de connaissance de l'assistant Qualios.

type Q = { q: string; r: string };
const p = OFFRE.parrainage;

const THEMES: { titre: string; questions: Q[] }[] = [
  {
    titre: "Démarrer",
    questions: [
      { q: "Comment créer mon compte ?", r: "Cliquez sur « Démarrer mon essai gratuit », saisissez votre SIRET (les informations de votre organisme sont reprises automatiquement depuis l'annuaire officiel des entreprises), puis confirmez votre email. Vous pouvez aussi vous connecter avec un compte Google." },
      { q: "Par quoi commencer ?", r: "Complétez votre organisme (raison sociale, SIRET, numéro de déclaration d'activité, adresse, logo) depuis Mon profil, créez une formation, puis un client. L'assistant Qualios, en bas à droite de l'écran, vous guide pas à pas." },
      { q: "Comment créer ma première formation ?", r: "Menu Formations → « Nouvelle formation ». Renseignez le titre, les objectifs, le programme, la durée et les modalités, puis enregistrez en brouillon ou publiez. Vous pouvez aussi partir d'un PDF existant : l'IA en extrait les informations." },
      { q: "Comment ajouter un client et ses sessions ?", r: "Menu Clients → ajoutez l'entreprise (raison sociale, SIRET, contact). Depuis sa fiche, créez une session en choisissant la formation et les dates, puis invitez le client à rejoindre son espace pour qu'il complète la liste des stagiaires." },
    ],
  },
  {
    titre: "Abonnement et facturation",
    questions: [
      { q: "Combien coûte QualioFlex ?", r: `${euros(OFFRE.abonnementHt)} HT par mois (${euros(ttc(OFFRE.abonnementHt))} TTC), plus ${euros(OFFRE.sessionHt)} HT par session facturée. Toutes les fonctionnalités sont incluses, sans option payante.` },
      { q: "Comment fonctionne l'essai gratuit ?", r: `L'essai dure ${OFFRE.essaiJours} jours, sans limite de fonctionnalités. Votre carte bancaire est enregistrée au démarrage mais aucun prélèvement n'a lieu pendant l'essai. Un bandeau indique les jours restants et un email vous prévient avant la fin. Ensuite, l'abonnement démarre automatiquement.` },
      { q: "Quand une session est-elle facturée ?", r: `Dès qu'elle est affectée à un client. Elle devient due 48 heures avant son démarrage. Si vous la supprimez ou l'annulez au moins 48 heures avant, elle n'est pas facturée ; la fenêtre de suppression vous l'indique. En sous-traitance, c'est l'organisme qui détient la formation qui paie la session.` },
      { q: "Quand suis-je prélevé ?", r: "Le 1er de chaque mois, sur une facture unique qui regroupe l'abonnement et les sessions dues le mois précédent. Le premier mois après l'essai est facturé au prorata." },
      { q: "Où trouver mes factures ?", r: "Menu avatar → « Abonnement et factures ». Toutes vos factures y sont téléchargeables en PDF, avec les sessions à facturer du mois en cours." },
      { q: "Comment changer de carte bancaire ?", r: "Abonnement et factures → « Gérer ma carte bancaire ». Vous êtes redirigé vers l'espace sécurisé de notre prestataire de paiement Stripe." },
      { q: "Que se passe-t-il si un paiement échoue ?", r: `Vous recevez un email : sans régularisation, votre accès est suspendu au bout de ${OFFRE.delaiSuspensionImpayeJours} jours (un rappel est envoyé 2 jours avant). Vos données sont conservées. Mettez à jour votre carte ou réglez la facture en ligne : l'accès est rétabli immédiatement.` },
      { q: "Comment résilier mon abonnement ?", r: `Abonnement et factures → « Résilier mon abonnement ». Le préavis est de ${OFFRE.preavisJours} jours et l'abonnement s'arrête le dernier jour du mois atteint (la date exacte est affichée avant de confirmer). Vous gardez l'accès jusque-là et pouvez annuler la résiliation à tout moment avant cette date.` },
    ],
  },
  {
    titre: "Parrainage",
    questions: [
      { q: "Comment parrainer un confrère ?", r: "Votre code et votre lien d'invitation sont sur votre tableau de bord et dans Abonnement et factures. Votre filleul s'inscrit avec le lien (le code est appliqué automatiquement) ou saisit le code au démarrage de son essai." },
      { q: "Qu'est-ce que je gagne ?", r: `Un mois d'abonnement offert pour vous et un pour votre filleul, dès qu'il règle sa première facture. À ${p.seuilArgent} filleuls, badge Membre Argent et un mois bonus. À ${p.seuilOr} filleuls, badge Membre Or et toutes vos sessions offertes pendant ${p.dureeSessionsOffertesMois} mois.` },
      { q: "Y a-t-il une limite ?", r: `Oui : ${p.maxFilleulsParAn} filleuls par année civile. Pendant l'année de sessions offertes du badge Or, le parrainage est mis en pause. Le parrainage est réservé aux organismes qui n'ont jamais été abonnés.` },
      { q: "Comment le mois offert est-il appliqué ?", r: "Il est déduit automatiquement de votre prochaine facture portant sur un mois complet d'abonnement. Les sessions du mois restent facturées." },
    ],
  },
  {
    titre: "Documents, signatures et relances",
    questions: [
      { q: "Comment envoyer une convention en signature ?", r: "Depuis la fiche client, ouvrez la session, générez la convention (elle reprend les stagiaires transmis par le client) puis envoyez-la en signature électronique DocuSign. Vous et votre client signez chacun à votre tour ; le statut se met à jour automatiquement." },
      { q: "Quelles relances sont automatiques ?", r: "Les documents en attente côté client sont relancés à J+2, avec une alerte à J+5. Le positionnement des stagiaires fait l'objet d'une alerte 2 jours avant la formation. Les évaluations à chaud, à froid, des acquis et sur le formateur sont envoyées et relancées automatiquement." },
      { q: "Mes stagiaires doivent-ils créer un compte ?", r: "Non. Ils reçoivent des liens personnels pour le positionnement, l'émargement, les évaluations, le livret d'accueil et l'attestation." },
      { q: "Que voit mon client dans son espace ?", r: "Uniquement ses propres sessions : documents à signer ou compléter, liste des stagiaires, émargements, évaluations et attestations." },
    ],
  },
  {
    titre: "Qualiopi, BPF et audit",
    questions: [
      { q: "QualioFlex me garantit-il la certification ?", r: "Non. Seul un organisme certificateur accrédité délivre la certification Qualiopi. QualioFlex vous aide à produire et organiser les preuves ; le pré-audit est un auto-diagnostic indicatif." },
      { q: "Comment préparer un audit ?", r: "Lancez le pré-audit (menu avatar → Pré-audit Qualiopi) pour repérer les points faibles, puis utilisez le menu Documents pour sélectionner les sessions contrôlées et obtenir, dossier par dossier, la complétude documentaire imprimable. Chaque session dispose aussi d'une page « preuve d'audit »." },
      { q: "Comment établir mon BPF ?", r: "Menu BPF : renseignez les cadres officiels, téléchargez le PDF puis recopiez-le sur Mon Activité Formation à l'aide du guide fourni. Échéance légale : 30 avril de l'année suivante." },
      { q: "Le référentiel Qualiopi a-t-il changé ?", r: "La page « Statut réglementaire » (menu avatar) affiche le résultat du contrôle mensuel automatique du référentiel national qualité." },
    ],
  },
  {
    titre: "Compte, données et sécurité",
    questions: [
      { q: "Comment activer la double authentification ?", r: "Paramètres → Sécurité → Double authentification. Scannez le QR code avec une application comme Google Authenticator ; un code à 6 chiffres vous sera demandé à chaque connexion." },
      { q: "Comment récupérer toutes mes données ?", r: `Une archive complète (formations, sessions, documents, conventions signées, preuves d'audit) est disponible pour ${euros(OFFRE.exportHt, 0)} HT, lors d'une suppression de compte (Paramètres) ou d'une résiliation (Abonnement et factures). Le lien de téléchargement vous est envoyé par email.` },
      { q: "Comment supprimer mon compte ?", r: "Paramètres → Supprimer mon compte. Vos données sont conservées 30 jours, délai pendant lequel vous pouvez changer d'avis, puis supprimées définitivement (les factures restent conservées 10 ans, comme l'exige la loi)." },
      { q: "Où sont hébergées mes données ?", r: "La base de données est hébergée dans l'Union européenne (Francfort). La liste complète des prestataires est sur la page RGPD." },
    ],
  },
];

const normaliser = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const Aide = () => {
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const filtre = normaliser(recherche.trim());
  const themes = useMemo(
    () => THEMES.map((t) => ({ ...t, questions: t.questions.filter((q) => !filtre || normaliser(q.q + " " + q.r).includes(filtre)) }))
      .filter((t) => t.questions.length),
    [filtre],
  );

  return (
    <PageLegale
      titre="Centre d'aide"
      introduction={
        <>
          <p>Les réponses aux questions les plus fréquentes. Dans l'application, l'assistant Qualios répond aussi à vos questions, à tout moment.</p>
          <label htmlFor="recherche-aide" className="sr-only">Rechercher dans l'aide</label>
          <input id="recherche-aide" type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher : facture, convention, parrainage…"
            className="mt-5 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-300" />
        </>
      }
    >
      {themes.length === 0 && <p className="mt-6 text-gray-600">Aucune réponse ne correspond à « {recherche} ». Essayez un autre mot, ou <Link to="/contact">contactez-nous</Link>.</p>}
      {themes.map((t) => (
        <div key={t.titre}>
          <H2>{t.titre}</H2>
          <div className="space-y-2">
            {t.questions.map((q) => {
              const cle = t.titre + q.q;
              const estOuverte = ouverte === cle || !!filtre;
              return (
                <div key={cle} className="rounded-xl border border-gray-100 bg-white shadow-sm">
                  <button type="button" aria-expanded={estOuverte} onClick={() => setOuverte(ouverte === cle ? null : cle)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium text-gray-800 hover:bg-gray-50 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
                    {q.q}<span aria-hidden className="text-lg text-gray-400">{estOuverte ? "−" : "+"}</span>
                  </button>
                  {estOuverte && <p className="px-5 pb-4 text-sm text-gray-600">{q.r}</p>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="mt-10 rounded-xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <p className="text-gray-600 mb-3">Vous ne trouvez pas votre réponse ?</p>
        <Link to="/contact" className="inline-block rounded-lg px-6 py-2 font-bold text-white no-underline" style={{ background: "#f2901e" }}>Contacter le support</Link>
      </div>
    </PageLegale>
  );
};

export default Aide;
