import { useState } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";

const faqs = [
  { q: "Comment créer ma première formation ?", r: "Depuis le menu 'Formations', cliquez sur '+ Nouvelle formation'. Remplissez les 3 étapes (informations générales, détails, confirmation) puis choisissez 'Enregistrer en brouillon' ou 'Publier'." },
  { q: "Comment générer et télécharger mon BPF ?", r: "Accédez à la page 'BPF' depuis le menu. Créez votre bilan annuel, renseignez les indicateurs, puis cliquez sur '📄 Télécharger PDF'. Un guide de déclaration sur MAF est inclus dans le document." },
  { q: "Qu'est-ce que le document_mode 'auto' vs 'import' ?", r: "'Auto' : QalioFlex génère et envoie automatiquement les documents à signer électroniquement. 'Import' : vous importez vos propres documents (papier ou autres logiciels)." },
  { q: "Comment modifier mon profil ou les infos de mon organisme ?", r: "Cliquez sur votre avatar en haut à droite → 'Mon profil'. Vous pouvez modifier vos infos personnelles et les données de votre organisme (raison sociale, NDA, adresse, email de contact...)." },
  { q: "Comment changer mon mot de passe ?", r: "Menu avatar → 'Paramètres' → section 'Sécurité'. Le nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial." },
  { q: "Mon BPF ne se crée pas — que faire ?", r: "Vérifiez que votre compte est bien rattaché à un organisme (page Profil → section 'Mon organisme'). Si la section n'apparaît pas, contactez le support." },
  { q: "Puis-je supprimer une formation publiée ?", r: "Oui — depuis la liste des formations, ouvrez la formation puis cliquez sur 'Supprimer'. Attention : cette action est irréversible." },
  { q: "Quand auront lieu les prochaines fonctionnalités ?", r: "La roadmap inclut l'intégration Stripe pour la facturation. Les mises à jour sont déployées automatiquement. (Le module de notation des formateurs et le pré-audit Qualiopi sont déjà disponibles : menus 'Notations' et 'Pré-audit Qualiopi'.)" },
];

const Aide = () => {
  const [open, setOpen] = useState<number | null>(null);
  const { session, user: authUser } = useAuth();
  const role = authUser?.user_metadata?.role;
  const retourHref = session ? (role === "client" ? "/espace-client" : "/dashboard") : "/";

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <Link to={retourHref} className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold mt-4 mb-2" style={{ color: "#25245e" }}>Centre d'aide</h1>
          <p className="text-gray-500 mb-8">Retrouvez les réponses aux questions les plus fréquentes sur QalioFlex.</p>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  className="w-full text-left px-5 py-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className="font-medium text-gray-800 pr-4">{faq.q}</span>
                  <span className="text-gray-400 text-lg flex-shrink-0">{open === i ? "−" : "+"}</span>
                </button>
                {open === i && (
                  <div className="px-5 pb-4 text-gray-600 text-sm border-t border-gray-50 pt-3">
                    {faq.r}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 bg-white border border-gray-100 rounded-xl p-6 text-center shadow-sm">
            <p className="text-gray-600 mb-3">Vous ne trouvez pas votre réponse ?</p>
            <Link to="/contact">
              <button style={{ background: "#f2901e", color: "#fff" }} className="font-bold px-6 py-2 rounded-lg">
                Contacter le support
              </button>
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Aide;
