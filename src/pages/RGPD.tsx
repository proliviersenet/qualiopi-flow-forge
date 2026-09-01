import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";

const RGPD = () => {
  const { session, user: authUser } = useAuth();
  const role = authUser?.user_metadata?.role;
  const retourHref = session ? (role === "client" ? "/espace-client" : "/dashboard") : "/";
  return (
  <div className="flex flex-col min-h-screen">
    <Header />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to={retourHref} className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-8" style={{ color: "#25245e" }}>RGPD — Gestion de vos données</h1>
        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p className="text-sm text-gray-400">Dernière mise à jour : 4 juillet 2026</p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium">QualioFlex est conçu dans le respect du Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679), en vigueur depuis le 25 mai 2018.</p>
          </div>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>Vos droits en tant qu'utilisateur</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              {[
                { icon: "👁", title: "Droit d'accès", desc: "Obtenir une copie complète de vos données personnelles détenues par QualioFlex." },
                { icon: "✏️", title: "Droit de rectification", desc: "Corriger toute donnée inexacte ou incomplète depuis votre espace profil." },
                { icon: "🗑", title: "Droit à l'effacement", desc: "Demander la suppression de votre compte et de toutes vos données associées." },
                { icon: "📦", title: "Droit à la portabilité", desc: "Recevoir vos données dans un format lisible et réutilisable (CSV/JSON)." },
                { icon: "🚫", title: "Droit d'opposition", desc: "Vous opposer au traitement de vos données à des fins de prospection." },
                { icon: "⏸", title: "Droit à la limitation", desc: "Demander la suspension temporaire du traitement de vos données." },
              ].map((r) => (
                <div key={r.title} className="bg-white border border-gray-100 rounded-lg p-4">
                  <p className="font-semibold text-sm mb-1">{r.icon} {r.title}</p>
                  <p className="text-xs text-gray-500">{r.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>Données relatives aux stagiaires</h2>
            <p>En tant que formateur utilisant QualioFlex, vous êtes <strong>responsable de traitement</strong> pour les données personnelles de vos propres stagiaires (nom, prénom, email, entreprise). EXSENCO agit en qualité de <strong>sous-traitant</strong> pour ces données. Vous devez informer vos stagiaires de vos propres traitements conformément au RGPD.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>Sous-traitants techniques</h2>
            <div className="space-y-2 mt-2">
              {[
                { name: "Supabase", role: "Hébergement base de données", pays: "Union Européenne", lien: "https://supabase.com/privacy" },
                { name: "Vercel", role: "Hébergement application web", pays: "Union Européenne", lien: "https://vercel.com/legal/privacy-policy" },
              ].map((s) => (
                <div key={s.name} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-3 text-sm">
                  <div>
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-gray-500 ml-2">— {s.role}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-green-600 block">✓ {s.pays}</span>
                    <a href={s.lien} target="_blank" rel="noopener noreferrer" className="text-xs text-exsenco-blue hover:underline">Politique de conf.</a>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>Exercer vos droits</h2>
            <p>Pour toute demande relative à vos données personnelles, contactez-nous :</p>
            <div className="bg-gray-50 rounded-lg p-4 mt-2 text-sm">
              <p><strong>SARL EXSENCO</strong> — DPO : Olivier SENET</p>
              <p>80 rue du Nouveau Bois, 37550 Saint-Avertin</p>
              <p>Email : <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline">olivier.senet@prospactive.com</a></p>
              <p className="mt-2 text-gray-500">Nous répondons à toute demande dans un délai maximum de <strong>30 jours</strong>.</p>
            </div>
            <p className="mt-3 text-sm">En cas de réponse insatisfaisante, vous pouvez saisir la <strong>CNIL</strong> : <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline">www.cnil.fr/fr/plaintes</a></p>
          </section>
        </div>
      </div>
    </main>
    <Footer />
  </div>
  );
};

export default RGPD;
