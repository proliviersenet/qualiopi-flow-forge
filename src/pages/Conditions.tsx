import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Conditions = () => (
  <div className="flex flex-col min-h-screen">
    <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-8" style={{ color: "#25245e" }}>Conditions d'utilisation</h1>
        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p className="text-sm text-gray-400">Dernière mise à jour : 4 juillet 2026</p>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>1. Éditeur</h2>
            <p>QalioFlex est édité par <strong>SASU EXSENCO</strong> — 80 rue du Nouveau Bois, 37550 Saint-Avertin — SIRET 892 787 458 000 17. En utilisant QalioFlex, vous acceptez les présentes conditions dans leur intégralité.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>2. Description du service</h2>
            <p>QalioFlex est une plateforme SaaS de gestion de la conformité Qualiopi destinée aux formateurs indépendants et organismes de formation. Elle permet notamment de gérer les formations, sessions, clients, documents, BPF et questionnaires de satisfaction.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>3. Accès au service</h2>
            <p>L'accès à QalioFlex nécessite la création d'un compte utilisateur. Vous êtes responsable de la confidentialité de vos identifiants. Tout accès depuis votre compte est réputé effectué par vous.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>4. Utilisation acceptable</h2>
            <p>Vous vous engagez à utiliser QalioFlex exclusivement pour des finalités légales et professionnelles. Sont notamment interdits : tout contenu illicite, toute tentative d'intrusion, tout usage à des fins concurrentielles non autorisées.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>5. Propriété intellectuelle</h2>
            <p>L'ensemble des éléments de QalioFlex (interface, code, logo, marque) sont la propriété exclusive de SASU EXSENCO. Toute reproduction ou représentation non autorisée est strictement interdite.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>6. Disponibilité</h2>
            <p>EXSENCO s'engage à maintenir QalioFlex disponible 24h/24, 7j/7, hors maintenances planifiées annoncées à l'avance. Aucune garantie de disponibilité absolue n'est accordée.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>7. Responsabilité</h2>
            <p>EXSENCO ne saurait être tenu responsable des dommages indirects liés à l'utilisation de QalioFlex. L'utilisateur est seul responsable des données qu'il saisit et de leur conformité avec la réglementation applicable (Qualiopi, RGPD, etc.).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>8. Résiliation</h2>
            <p>Vous pouvez résilier votre compte à tout moment depuis la page Paramètres. EXSENCO se réserve le droit de suspendre ou supprimer tout compte en cas de violation des présentes conditions.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>9. Droit applicable</h2>
            <p>Les présentes conditions sont soumises au droit français. En cas de litige, les tribunaux compétents du ressort de Tours sont seuls compétents.</p>
          </section>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default Conditions;
