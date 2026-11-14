import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Check, ShieldCheck, FileSignature, ClipboardCheck, Sparkles, Users, BarChart3, BellRing, FileText, Handshake, Star } from "lucide-react";
import { OFFRE, euros, ttc, EXSENCO_URL } from "@/lib/offre";

// Refonte de la page d'accueil (14/11/2026) — BAT avant mise en production.
// Couleurs QualioFlex conservées : indigo #25245e / #1a1942, orange #f2901e,
// sable #fad4a0. Titres en Bricolage Grotesque (police hébergée sur le site,
// pas d'appel à Google Fonts). Élément central : la « facture du 1er du mois »
// interactive, qui rend la tarification concrète (abonnement + sessions).

const INDIGO = "#25245e";
const NUIT = "#1a1942";
const ORANGE = "#f2901e";
const SABLE = "#fad4a0";
const PAPIER = "#f6f5fb";
export const TITRE = { fontFamily: "'Bricolage Grotesque Variable', system-ui, sans-serif" };

const CtaEssai = ({ clair = false, libelle = "Démarrer mon essai gratuit" }: { clair?: boolean; libelle?: string }) => (
  <Link
    to="/register"
    className="inline-flex items-center justify-center rounded-lg px-6 py-3.5 text-base font-bold transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300 hover:-translate-y-0.5"
    style={clair ? { background: "#fff", color: INDIGO } : { background: ORANGE, color: "#fff" }}
  >
    {libelle}
  </Link>
);

// ─────────────────────────── Bandeau ExSenCo ───────────────────────────
export const BandeauExsenco = () => (
  <div style={{ background: NUIT }} className="text-sm text-white/85">
    <div className="container mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
      <span>QualioFlex est conçu et édité par <strong className="text-white">ExSenCo</strong>, cabinet de développement commercial des TPE, PME et organismes de formation.</span>
      <a href={EXSENCO_URL} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 rounded"
        style={{ color: SABLE }}>
        Découvrir ExSenCo <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  </div>
);

// ─────────────────────────── Hero + facture interactive ───────────────────────────
const FactureSimulee = () => {
  const [sessions, setSessions] = useState(4);
  const totalHt = OFFRE.abonnementHt + sessions * OFFRE.sessionHt;
  const premier = new Date();
  premier.setMonth(premier.getMonth() + 1, 1);
  return (
    <div className="relative mx-3 sm:mx-0">
      <div aria-hidden className="absolute -inset-2 sm:-inset-3 rotate-2 rounded-2xl" style={{ background: ORANGE, opacity: 0.9 }} />
      <figure className="relative rounded-2xl bg-white p-6 sm:p-7 shadow-2xl text-gray-800" aria-label="Simulation de votre facture mensuelle">
        <div className="flex items-start justify-between gap-4 border-b border-dashed border-gray-300 pb-4">
          <div>
            <p className="text-xs text-gray-500">Votre facture QualioFlex</p>
            <p className="text-lg font-bold" style={{ ...TITRE, color: INDIGO }}>
              du 1<sup>er</sup> {premier.toLocaleDateString("fr-FR", { month: "long" })}
            </p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "#eef6ee", color: "#2f7a3b" }}>Sans engagement</span>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Abonnement mensuel</dt><dd className="tabular-nums">{euros(OFFRE.abonnementHt)}</dd></div>
          <div className="flex justify-between"><dt>{sessions} session{sessions > 1 ? "s" : ""} × {euros(OFFRE.sessionHt)}</dt><dd className="tabular-nums">{euros(sessions * OFFRE.sessionHt)}</dd></div>
          <div className="flex justify-between text-gray-500"><dt>TVA 20 %</dt><dd className="tabular-nums">{euros(ttc(totalHt) - totalHt)}</dd></div>
        </dl>

        <label htmlFor="simu-sessions" className="mt-5 block text-sm font-medium text-gray-700">
          Combien de sessions animez-vous par mois ?
        </label>
        <input id="simu-sessions" type="range" min={0} max={20} value={sessions}
          onChange={(e) => setSessions(Number(e.target.value))}
          className="mt-2 w-full h-2 cursor-pointer appearance-auto rounded-full accent-[#f2901e]"
          style={{ background: `linear-gradient(to right, ${ORANGE} ${(sessions / 20) * 100}%, #e5e4ef ${(sessions / 20) * 100}%)` }} />

        <div className="mt-4 flex items-end justify-between border-t border-gray-200 pt-4">
          <span className="text-sm text-gray-600">Total HT</span>
          <span className="text-4xl font-extrabold tabular-nums" style={{ ...TITRE, color: INDIGO }}>{euros(totalHt)}</span>
        </div>
        <figcaption className="mt-3 text-xs text-gray-500">
          {euros(ttc(totalHt))} TTC. Une session n'est facturée que si elle est maintenue 48 h avant son démarrage.
        </figcaption>
      </figure>
    </div>
  );
};

export const HeroAccueil = () => (
  <section style={{ background: `linear-gradient(160deg, ${INDIGO} 0%, ${NUIT} 100%)` }} className="text-white">
    <div className="container mx-auto px-4 py-16 md:py-24 grid md:grid-cols-[1.1fr_0.9fr] gap-12 md:gap-16 items-center">
      <div>
        <p className="text-base mb-5" style={{ color: SABLE }}>Logiciel de conformité Qualiopi pour formateurs et organismes de formation</p>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] tracking-tight" style={TITRE}>
          Vos dossiers Qualiopi prêts pour l'audit, sans y passer vos soirées.
        </h1>
        <p className="mt-6 text-lg text-white/80 max-w-xl leading-relaxed">
          Conventions signées en ligne, émargements, évaluations, attestations, BPF et preuves d'audit :
          QualioFlex prépare et relance pour vous, session après session.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <CtaEssai />
          <a href="#tarifs" className="text-white/85 underline underline-offset-4 hover:text-white">Voir les tarifs</a>
        </div>
        <ul className="mt-8 grid sm:grid-cols-3 gap-3 text-sm text-white/80">
          <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: ORANGE }} aria-hidden />{OFFRE.essaiJours} jours d'essai gratuit</li>
          <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: ORANGE }} aria-hidden />Sans engagement</li>
          <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" style={{ color: ORANGE }} aria-hidden />Données hébergées en UE</li>
        </ul>
      </div>
      <FactureSimulee />
    </div>
  </section>
);

// ─────────────────────────── Technologies ───────────────────────────
const TECHNOS = [
  { nom: "Stripe", role: "Paiement sécurisé" },
  { nom: "DocuSign", role: "Signature électronique" },
  { nom: "Claude", role: "IA par Anthropic" },
  { nom: "Supabase", role: "Données hébergées en UE" },
  { nom: "Vercel", role: "Hébergement de l'application" },
  { nom: "Brevo", role: "Emails et relances" },
];

export const TechnologiesAccueil = () => (
  <section className="bg-white border-b border-gray-100">
    <div className="container mx-auto px-4 py-10">
      <h2 className="text-center text-sm text-gray-500">Construit avec des services reconnus pour leur fiabilité</h2>
      <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-4 text-center">
        {TECHNOS.map((t) => (
          <li key={t.nom}>
            <p className="text-xl font-bold text-gray-700" style={TITRE}>{t.nom}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t.role}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

// ─────────────────────────── Parcours d'une session (séquence réelle) ───────────────────────────
const ETAPES = [
  { titre: "Convention signée", texte: "Générée avec vos stagiaires, signée en ligne par vous et votre client." },
  { titre: "Positionnement", texte: "Questionnaire avant formation envoyé aux stagiaires, alerte s'il manque 2 jours avant." },
  { titre: "Émargement", texte: "Feuille d'émargement électronique, signée en ligne par les stagiaires." },
  { titre: "Évaluations", texte: "À chaud, à froid, acquis et avis sur le formateur, relancés automatiquement." },
  { titre: "Attestation", texte: "Attestation de fin de formation générée et transmise." },
  { titre: "Preuve d'audit", texte: "Le dossier complet de la session, prêt à présenter à l'auditeur." },
];

export const ParcoursAccueil = () => (
  <section className="py-20" style={{ background: PAPIER }}>
    <div className="container mx-auto px-4">
      <div className="max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ ...TITRE, color: INDIGO }}>
          Une session, six étapes, zéro oubli
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          Chaque session suit le même parcours documentaire. QualioFlex envoie, relance et range chaque pièce au bon endroit.
        </p>
      </div>
      <ol className="mt-12 grid gap-8 md:grid-cols-3 lg:grid-cols-6 relative">
        {ETAPES.map((e, i) => (
          <li key={e.titre} className="relative">
            <div className="flex items-center gap-3 lg:block">
              <span className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-extrabold text-white shrink-0" style={{ ...TITRE, background: i === ETAPES.length - 1 ? ORANGE : INDIGO }}>
                {i + 1}
              </span>
              {i < ETAPES.length - 1 && <span aria-hidden className="hidden lg:block absolute top-[22px] left-12 right-0 h-0.5" style={{ background: "#d9d7ea" }} />}
              <h3 className="font-bold text-gray-900 lg:mt-4" style={TITRE}>{e.titre}</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">{e.texte}</p>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

// ─────────────────────────── Fonctionnalités ───────────────────────────
const MODULES = [
  { icone: FileSignature, titre: "Documents et signature", points: ["Devis, conventions, livret d'accueil, attestations", "Signature électronique DocuSign", "Espace client pour vos entreprises clientes"] },
  { icone: BellRing, titre: "Relances automatiques", points: ["Documents en attente relancés à J+2, alerte à J+5", "Évaluations à chaud, à froid et des acquis", "Alerte avant formation si le positionnement manque"] },
  { icone: ClipboardCheck, titre: "Pilotage Qualiopi", points: ["Pré-audit sur vos vraies données", "Dossiers de preuve par session, imprimables", "Veille du référentiel national qualité"] },
  { icone: Sparkles, titre: "Intelligence artificielle", points: ["Trame pédagogique générée depuis vos PDF", "Questionnaires d'évaluation proposés par l'IA", "Qualios, l'assistant qui répond dans l'application"] },
  { icone: BarChart3, titre: "BPF et indicateurs", points: ["Bilan pédagogique et financier aux cadres officiels", "Export PDF et guide de saisie sur Mon Activité Formation", "Tableau de bord des actions à traiter"] },
  { icone: Handshake, titre: "Réseau et réputation", points: ["Sous-traitance entre formateurs QualioFlex", "Notation des formateurs par les stagiaires", "Widget d'avis à afficher sur votre site"] },
];

export const FonctionnalitesAccueil = () => (
  <section className="py-20 bg-white" id="fonctionnalites">
    <div className="container mx-auto px-4">
      <div className="max-w-2xl">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ ...TITRE, color: INDIGO }}>
          Tout le quotidien d'un organisme de formation, au même endroit
        </h2>
        <p className="mt-4 text-lg text-gray-600">Toutes les fonctionnalités sont incluses dans l'abonnement, sans option payante cachée.</p>
      </div>
      <div className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m) => (
          <div key={m.titre}>
            <m.icone className="h-7 w-7" style={{ color: ORANGE }} aria-hidden />
            <h3 className="mt-3 text-xl font-bold text-gray-900" style={TITRE}>{m.titre}</h3>
            <ul className="mt-3 space-y-2 text-gray-600">
              {m.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-relaxed"><Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" aria-hidden />{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─────────────────────────── Tarifs + parrainage ───────────────────────────
const INCLUS = [
  "Formations, sessions, clients et stagiaires illimités",
  "Signature électronique des conventions",
  "Relances et évaluations automatiques",
  "Pré-audit Qualiopi et dossiers de preuve",
  "BPF, IA et assistant Qualios",
  "Factures disponibles dans votre espace",
];

export const TarifsAccueil = () => (
  <section className="py-20" id="tarifs" style={{ background: PAPIER }}>
    <div className="container mx-auto px-4">
      <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 items-start">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ ...TITRE, color: INDIGO }}>
            Un prix simple, qui suit votre activité
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Un abonnement unique, et quelques euros par session réellement animée. Vous ne payez pas pour les mois creux.
          </p>
          <dl className="mt-8 space-y-5">
            <div>
              <dt className="text-sm text-gray-500">Abonnement</dt>
              <dd className="text-4xl font-extrabold" style={{ ...TITRE, color: INDIGO }}>{euros(OFFRE.abonnementHt)} <span className="text-lg font-semibold text-gray-500">HT / mois</span></dd>
              <dd className="text-sm text-gray-500">soit {euros(ttc(OFFRE.abonnementHt))} TTC, facturé le 1er du mois (le premier mois au prorata)</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Par session</dt>
              <dd className="text-4xl font-extrabold" style={{ ...TITRE, color: INDIGO }}>{euros(OFFRE.sessionHt, 0)} <span className="text-lg font-semibold text-gray-500">HT</span></dd>
              <dd className="text-sm text-gray-500">uniquement pour les sessions affectées à un client et maintenues 48 h avant leur démarrage</dd>
            </div>
          </dl>
          <div className="mt-8"><CtaEssai libelle={`Essayer gratuitement pendant ${OFFRE.essaiJours} jours`} /></div>
          <p className="mt-3 text-sm text-gray-500">Carte bancaire demandée à l'inscription, aucun prélèvement pendant l'essai. Résiliable à tout moment avec un préavis de 30 jours.</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-7 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900" style={TITRE}>Tout est inclus</h3>
            <ul className="mt-4 grid sm:grid-cols-2 gap-3">
              {INCLUS.map((i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700"><Check className="h-4 w-4 mt-0.5 shrink-0 text-green-600" aria-hidden />{i}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl p-7 text-white" style={{ background: INDIGO }}>
            <h3 className="text-lg font-bold" style={TITRE}>Parrainez vos confrères, gagnez des mois offerts</h3>
            <p className="mt-2 text-sm text-white/80">Chaque formateur que vous recommandez vous offre un mois d'abonnement, et lui en offre un aussi, dès sa première facture.</p>
            <ul className="mt-5 grid sm:grid-cols-2 gap-4 text-sm">
              <li className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.08)" }}>
                <p className="font-bold" style={{ color: "#dfe3e8" }}>Membre Argent</p>
                <p className="text-white/80 mt-1">{OFFRE.parrainage.seuilArgent} filleuls : un mois offert en bonus.</p>
              </li>
              <li className="rounded-xl p-4" style={{ background: "rgba(242,144,30,0.18)" }}>
                <p className="font-bold" style={{ color: SABLE }}>Membre Or</p>
                <p className="text-white/80 mt-1">{OFFRE.parrainage.seuilOr} filleuls : toutes vos sessions offertes pendant un an.</p>
              </li>
            </ul>
            <p className="mt-4 text-xs text-white/60">Jusqu'à {OFFRE.parrainage.maxFilleulsParAn} filleuls par an. Conditions détaillées dans les conditions générales.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─────────────────────────── Témoignages ───────────────────────────
// BAT : AUCUN témoignage inventé. Les cartes ci-dessous sont des emplacements
// à remplir avec de vrais témoignages de bêta-testeurs (prénom, nom, structure,
// citation exacte et accord écrit de publication). Tant qu'un témoignage est
// marqué aRemplacer, il s'affiche comme un emplacement et non comme un avis.
type Temoignage = { citation: string; nom: string; structure: string; aRemplacer?: boolean };
const TEMOIGNAGES: Temoignage[] = [
  { citation: "Témoignage à fournir : ce que QualioFlex a changé dans la préparation de l'audit.", nom: "Prénom Nom", structure: "Organisme, ville", aRemplacer: true },
  { citation: "Témoignage à fournir : le temps gagné sur les conventions et les relances.", nom: "Prénom Nom", structure: "Organisme, ville", aRemplacer: true },
  { citation: "Témoignage à fournir : la prise en main et l'accompagnement.", nom: "Prénom Nom", structure: "Organisme, ville", aRemplacer: true },
];

export const TemoignagesAccueil = () => (
  <section className="py-20 bg-white">
    <div className="container mx-auto px-4">
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight max-w-2xl" style={{ ...TITRE, color: INDIGO }}>
        Ils préparent leurs audits avec QualioFlex
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {TEMOIGNAGES.map((t, i) => (
          <figure key={i} className={`rounded-2xl p-7 ${t.aRemplacer ? "border-2 border-dashed border-amber-400 bg-amber-50" : "border border-gray-200"}`}>
            {t.aRemplacer && <p className="mb-3 inline-block rounded bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">BAT · emplacement à remplir</p>}
            <div className="flex gap-0.5" aria-hidden>{[0, 1, 2, 3, 4].map((n) => <Star key={n} className="h-4 w-4" style={{ color: ORANGE, fill: ORANGE }} />)}</div>
            <blockquote className="mt-4 text-gray-800 leading-relaxed">« {t.citation} »</blockquote>
            <figcaption className="mt-5 text-sm">
              <span className="font-semibold text-gray-900">{t.nom}</span>
              <span className="block text-gray-500">{t.structure}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  </section>
);

// ─────────────────────────── FAQ ───────────────────────────
const FAQ = [
  { q: "Comment fonctionne l'essai gratuit ?", r: `Vous créez votre compte et enregistrez une carte bancaire. Pendant ${OFFRE.essaiJours} jours, vous utilisez QualioFlex sans aucune limite et sans être prélevé. Un email vous prévient avant la fin de l'essai ; sans action de votre part, l'abonnement démarre ensuite automatiquement.` },
  { q: "Qu'est-ce qu'une session facturée ?", r: `Une session est facturée ${euros(OFFRE.sessionHt, 0)} HT dès qu'elle est affectée à un client. Si vous la supprimez ou l'annulez au moins 48 heures avant son démarrage, elle n'est pas facturée. Les sessions sont regroupées sur la facture du 1er du mois suivant.` },
  { q: "Puis-je arrêter quand je veux ?", r: "Oui, QualioFlex est sans engagement. La résiliation se fait en un clic depuis votre espace, avec un préavis de 30 jours : l'abonnement prend fin le dernier jour du mois atteint. Vous pouvez changer d'avis jusqu'à cette date." },
  { q: "Que deviennent mes données si je pars ?", r: `Elles restent conservées et vous pouvez récupérer l'ensemble de vos dossiers (formations, sessions, documents, conventions signées, preuves d'audit) dans une archive complète pour ${euros(OFFRE.exportHt, 0)} HT.` },
  { q: "QualioFlex garantit-il ma certification Qualiopi ?", r: "Non : seul un organisme certificateur accrédité délivre la certification. QualioFlex vous aide à produire, organiser et retrouver les preuves attendues par le référentiel national qualité, et le pré-audit vous signale les points à renforcer." },
  { q: "Où sont hébergées mes données ?", r: "La base de données est hébergée dans l'Union européenne (Francfort). Les échanges sont chiffrés, et la double authentification est disponible pour votre compte. Le détail des services utilisés figure dans notre politique de confidentialité." },
];

export const FaqAccueil = () => {
  const [ouvert, setOuvert] = useState<number | null>(0);
  return (
    <section className="py-20" style={{ background: PAPIER }}>
      <div className="container mx-auto px-4 max-w-3xl">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ ...TITRE, color: INDIGO }}>Vos questions avant de commencer</h2>
        <div className="mt-10 divide-y divide-gray-200 border-y border-gray-200">
          {FAQ.map((f, i) => (
            <div key={f.q}>
              <h3>
                <button type="button" aria-expanded={ouvert === i} onClick={() => setOuvert(ouvert === i ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-lg font-semibold text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 rounded">
                  {f.q}
                  <span aria-hidden className="text-2xl leading-none" style={{ color: ORANGE }}>{ouvert === i ? "−" : "+"}</span>
                </button>
              </h3>
              {ouvert === i && <p className="pb-5 text-gray-600 leading-relaxed">{f.r}</p>}
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-gray-500">D'autres questions ? Consultez le <Link to="/aide" className="underline" style={{ color: INDIGO }}>centre d'aide</Link> ou <Link to="/contact" className="underline" style={{ color: INDIGO }}>écrivez-nous</Link>.</p>
      </div>
    </section>
  );
};

// ─────────────────────────── ExSenCo ───────────────────────────
const SERVICES_EXSENCO = [
  { icone: Users, titre: "Trouver des clients", texte: "Ciblage, prospection et plan d'action commercial pour remplir vos sessions." },
  { icone: FileText, titre: "Vendre vos formations", texte: "Argumentaires, propositions et traitement des objections adaptés à votre offre." },
  { icone: ShieldCheck, titre: "Piloter votre développement", texte: "Direction commerciale externalisée : stratégie, indicateurs et suivi dans la durée." },
];

export const ExsencoAccueil = () => (
  <section className="py-20 text-white" style={{ background: NUIT }}>
    <div className="container mx-auto px-4 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
      <div>
        <p style={{ color: SABLE }}>Un produit ExSenCo</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-extrabold tracking-tight" style={TITRE}>
          Votre conformité est en ordre. Et vos sessions, qui les remplit ?
        </h2>
        <p className="mt-4 text-lg text-white/75">
          ExSenCo, le cabinet d'Olivier Senet à Saint-Avertin, accompagne les dirigeants de TPE, de PME et les formateurs
          dans leur développement commercial. QualioFlex est né de cette expérience du terrain.
        </p>
        <a href={EXSENCO_URL} target="_blank" rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-lg px-6 py-3.5 font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
          style={{ background: SABLE, color: NUIT }}>
          Découvrir l'accompagnement ExSenCo <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <ul className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
        {SERVICES_EXSENCO.map((s) => (
          <li key={s.titre} className="flex gap-4 rounded-xl p-5" style={{ background: "rgba(255,255,255,0.06)" }}>
            <s.icone className="h-6 w-6 shrink-0" style={{ color: ORANGE }} aria-hidden />
            <div>
              <h3 className="font-bold" style={TITRE}>{s.titre}</h3>
              <p className="mt-1 text-sm text-white/70">{s.texte}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

// ─────────────────────────── Appel final ───────────────────────────
export const CtaFinalAccueil = () => (
  <section className="py-20 bg-white">
    <div className="container mx-auto px-4 text-center max-w-2xl">
      <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight" style={{ ...TITRE, color: INDIGO }}>
        Votre prochain audit commence par votre prochaine session
      </h2>
      <p className="mt-4 text-lg text-gray-600">
        {OFFRE.essaiJours} jours pour tout tester sur vos vraies formations. Sans engagement, aucun prélèvement pendant l'essai.
      </p>
      <div className="mt-8"><CtaEssai /></div>
    </div>
  </section>
);
