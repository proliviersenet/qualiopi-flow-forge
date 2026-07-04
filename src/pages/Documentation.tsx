import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const sections = [
  {
    titre: "🚀 Démarrage rapide",
    items: [
      { label: "Créer votre compte", desc: "Inscription, rattachement à votre organisme, première connexion." },
      { label: "Configurer votre profil", desc: "Renseigner votre NDA, SIRET, adresse et email de contact." },
      { label: "Créer votre première formation", desc: "Titre, programme, objectifs, durée, tarif, modalités." },
    ],
  },
  {
    titre: "📚 Gestion des formations",
    items: [
      { label: "Créer et publier une formation", desc: "Formulaire en 3 étapes, enregistrement brouillon ou publication directe." },
      { label: "Modifier une formation existante", desc: "Édition complète, changement de statut brouillon ↔ publié." },
      { label: "Archiver ou supprimer", desc: "Gestion du cycle de vie de vos formations." },
    ],
  },
  {
    titre: "📊 Bilan Pédagogique et Financier (BPF)",
    items: [
      { label: "Créer son BPF annuel", desc: "Saisie des indicateurs, répartition thématiques, validation." },
      { label: "Télécharger le PDF MAF", desc: "Export PDF aux couleurs ExSenCo + guide de déclaration sur MAF (DREETS)." },
      { label: "Valider et archiver son BPF", desc: "Workflow de validation, horodatage, archivage sécurisé." },
    ],
  },
  {
    titre: "👤 Mon compte",
    items: [
      { label: "Profil et organisme", desc: "Modifier vos données personnelles et les informations de votre OF." },
      { label: "Sécurité et mot de passe", desc: "Règles de sécurité, changement de mot de passe." },
      { label: "Notifications", desc: "Paramétrer les alertes relances et signatures électroniques." },
      { label: "Suppression de compte", desc: "Procédure de suppression, récupération des données (10€)." },
    ],
  },
  {
    titre: "🔒 RGPD et données",
    items: [
      { label: "Vos droits RGPD", desc: "Accès, rectification, effacement, portabilité, opposition." },
      { label: "Hébergement et sécurité", desc: "Supabase EU, TLS, bcrypt — conformité RGPD garantie." },
      { label: "Données de vos stagiaires", desc: "Votre rôle de responsable de traitement et vos obligations." },
    ],
  },
];

const Documentation = () => (
  <div className="flex flex-col min-h-screen">
    <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "#25245e" }}>Documentation</h1>
        <p className="text-gray-500 mb-8">Tout ce que vous devez savoir pour utiliser QalioFlex efficacement.</p>

        <div className="space-y-6">
          {sections.map((s) => (
            <div key={s.titre} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50" style={{ background: "#f5f5f8" }}>
                <h2 className="font-semibold" style={{ color: "#25245e" }}>{s.titre}</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {s.items.map((item) => (
                  <div key={item.label} className="px-5 py-3">
                    <p className="font-medium text-sm text-gray-800">{item.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400 mb-3">Documentation complète en cours de rédaction — mise à jour continue.</p>
          <Link to="/contact">
            <button style={{ background: "#25245e", color: "#fff" }} className="font-bold px-6 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
              Une question ? Contactez-nous
            </button>
          </Link>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default Documentation;
