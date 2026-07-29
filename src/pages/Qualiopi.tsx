import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const criteres = [
  { num: "1", titre: "Information du public", desc: "Conditions d'accès, délais, tarifs, contacts, accessibilité des publics en situation de handicap." },
  { num: "2", titre: "Identification des objectifs", desc: "Objectifs de la prestation adaptés au public, en cohérence avec les compétences visées." },
  { num: "3", titre: "Adaptation aux publics", desc: "Positionnement préalable, adaptation des prestations au profil et aux besoins des bénéficiaires." },
  { num: "4", titre: "Adéquation des moyens", desc: "Moyens pédagogiques, techniques et d'encadrement adaptés aux prestations délivrées." },
  { num: "5", titre: "Qualification des formateurs", desc: "Compétences professionnelles et pédagogiques des intervenants adaptées aux prestations." },
  { num: "6", titre: "Inscription dans l'environnement", desc: "Veille légale, réglementaire et sectorielle. Intégration dans l'environnement professionnel." },
  { num: "7", titre: "Recueil des appréciations", desc: "Recueil et traitement des appréciations et réclamations des parties prenantes." },
];

const Qualiopi = () => (
  <div className="flex flex-col min-h-screen">
    <Header />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "#25245e" }}>Référentiel Qualiopi</h1>
        <p className="text-gray-500 mb-8">Les 7 critères du Référentiel National Qualité (RNQ) que QalioFlex vous aide à respecter.</p>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-8">
          <h2 className="font-bold text-blue-900 mb-2">Qu'est-ce que Qualiopi ?</h2>
          <p className="text-sm text-blue-800">La certification Qualiopi est obligatoire depuis le 1er janvier 2022 pour tous les organismes de formation souhaitant accéder aux financements publics et mutualisés (CPF, OPCO, Pôle Emploi, Régions...). Elle est délivrée par un organisme certificateur accrédité par le COFRAC.</p>
        </div>

        <div className="space-y-3 mb-8">
          {criteres.map((c) => (
            <div key={c.num} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex gap-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm" style={{ background: "#25245e" }}>
                {c.num}
              </div>
              <div>
                <p className="font-semibold text-gray-800 mb-1">{c.titre}</p>
                <p className="text-sm text-gray-500">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
          <h2 className="font-bold mb-2" style={{ color: "#f2901e" }}>Comment QalioFlex vous aide</h2>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>✓ <strong>Critère 3</strong> : Positionnement et adaptation — via les questionnaires pré-formation</li>
            <li>✓ <strong>Critère 7</strong> : Recueil des appréciations — via les évaluations stagiaires (à venir)</li>
            <li>✓ <strong>BPF</strong> : Traçabilité annuelle de votre activité (Critères 1, 2, 4)</li>
            <li>✓ <strong>Documents</strong> : Conventions, feuilles de présence, attestations (Critères 4, 5)</li>
          </ul>
          <p className="text-xs text-gray-400 mt-3">Source : <a href="https://travail-emploi.gouv.fr/formation-professionnelle/acteurs-et-metiers-de-la-formation/qualiopi" target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline">Ministère du Travail — Qualiopi</a></p>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default Qualiopi;
