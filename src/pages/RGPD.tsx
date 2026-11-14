import { Link } from "react-router-dom";
import PageLegale, { H2 } from "@/components/PageLegale";
import { SOUS_TRAITANTS } from "@/lib/sousTraitants";
import { CONTACT_EMAIL, OFFRE, euros } from "@/lib/offre";

// Page RGPD — refonte du 14/11/2026 : rôles, engagements de sous-traitant
// (article 28 du RGPD) vis-à-vis des organismes de formation, liste à jour des
// sous-traitants ultérieurs, exercice des droits. À faire relire par un conseil
// juridique avant publication.

const DROITS = [
  { titre: "Droit d'accès", desc: "Obtenir une copie de vos données personnelles." },
  { titre: "Droit de rectification", desc: "Corriger une donnée inexacte, le plus souvent directement depuis votre profil." },
  { titre: "Droit à l'effacement", desc: "Demander la suppression de votre compte et de vos données, sous réserve des obligations légales (factures)." },
  { titre: "Droit à la portabilité", desc: "Recevoir vos données dans un format structuré et réutilisable." },
  { titre: "Droit d'opposition", desc: "Vous opposer aux emails d'information sur le parrainage et les nouveautés." },
  { titre: "Droit à la limitation", desc: "Demander la suspension temporaire d'un traitement contesté." },
];

const RGPD = () => (
  <PageLegale
    titre="RGPD : vos données et celles de vos stagiaires"
    miseAJour="14 novembre 2026"
    introduction={
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        QualioFlex est conçu dans le respect du Règlement général sur la protection des données (UE 2016/679) et de la loi
        Informatique et Libertés. Cette page complète la <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
      </p>
    }
  >
    <H2>Vos droits</H2>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {DROITS.map((d) => (
        <div key={d.titre} className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="font-semibold text-sm text-gray-900">{d.titre}</p>
          <p className="text-sm text-gray-600 mt-1">{d.desc}</p>
        </div>
      ))}
    </div>

    <H2>Les données de vos stagiaires et de vos clients</H2>
    <p>
      Lorsque vous enregistrez dans QualioFlex vos entreprises clientes et vos stagiaires (nom, prénom, email, entreprise,
      émargements, évaluations), <strong>vous êtes responsable de traitement</strong> et <strong>ExSenCo agit comme
      sous-traitant</strong>. Il vous appartient d'informer vos stagiaires, par exemple dans votre livret d'accueil, de
      l'usage de leurs données et de l'utilisation de QualioFlex.
    </p>
    <p>En tant que sous-traitant, ExSenCo s'engage à :</p>
    <ul>
      <li>traiter ces données uniquement pour fournir le service et selon vos instructions ;</li>
      <li>garantir la confidentialité des données et en limiter l'accès aux personnes habilitées ;</li>
      <li>mettre en œuvre les mesures de sécurité décrites dans la politique de confidentialité ;</li>
      <li>ne recourir qu'aux sous-traitants listés ci-dessous, et vous informer de tout changement ;</li>
      <li>vous aider à répondre aux demandes d'exercice des droits de vos stagiaires ;</li>
      <li>vous notifier sans délai toute violation de données vous concernant ;</li>
      <li>à la fin du contrat, vous permettre de récupérer vos données (archive complète à {euros(OFFRE.exportHt, 0)} HT, ou exercice gratuit du droit à la portabilité), puis les supprimer selon les durées prévues.</li>
    </ul>

    <H2>Sous-traitants ultérieurs</H2>
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr><th className="px-4 py-2">Prestataire</th><th className="px-4 py-2">Usage</th><th className="px-4 py-2">Localisation</th></tr>
        </thead>
        <tbody>
          {SOUS_TRAITANTS.map((s) => (
            <tr key={s.nom} className="border-t border-gray-100 align-top">
              <td className="px-4 py-2 font-medium"><a href={s.lien} target="_blank" rel="noopener noreferrer">{s.nom}</a></td>
              <td className="px-4 py-2 text-gray-600">{s.usage}</td>
              <td className="px-4 py-2 text-gray-600">{s.localisation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <H2>Exercer vos droits</H2>
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm space-y-1">
      <p><strong>SARL EXSENCO</strong> — référent données personnelles : Olivier Senet</p>
      <p>80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
      <p>Email : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      <p className="text-gray-500 pt-1">Nous répondons à toute demande dans un délai d'un mois.</p>
    </div>
    <p>En cas de réponse insatisfaisante, vous pouvez saisir la CNIL : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer">www.cnil.fr/fr/plaintes</a>.</p>
  </PageLegale>
);

export default RGPD;
