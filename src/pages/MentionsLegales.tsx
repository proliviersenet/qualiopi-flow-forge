import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const MentionsLegales = () => (
  <div className="flex flex-col min-h-screen">
    <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-8" style={{ color: "#25245e" }}>Mentions légales</h1>
        <div className="space-y-6 text-gray-700">
          <p className="text-sm text-gray-400">Conformément à la loi n°2004-575 du 21 juin 2004 pour la Confiance dans l'Économie Numérique (LCEN).</p>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Éditeur du site</h2>
            <div className="text-sm space-y-1">
              <p><strong>Raison sociale :</strong> SARL EXSENCO</p>
              <p><strong>Forme juridique :</strong> Société à Responsabilité Limitée (SARL)</p>
              <p><strong>SIRET :</strong> 892 787 458 000 17</p>
              <p><strong>Siège social :</strong> 80 rue du Nouveau Bois, 37550 Saint-Avertin, France</p>
              <p><strong>Directeur de la publication :</strong> Olivier SENET</p>
              <p><strong>Email :</strong> <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline">olivier.senet@prospactive.com</a></p>
              <p><strong>Téléphone :</strong> <a href="tel:+33607467409" className="text-exsenco-blue hover:underline">06 07 46 74 09</a></p>
              <p><strong>Activité :</strong> Édition de logiciels applicatifs (NAF 5829A)</p>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Hébergement</h2>
            <div className="text-sm space-y-3">
              <div>
                <p className="font-medium">Application web — Vercel Inc.</p>
                <p className="text-gray-500">440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</p>
                <p className="text-gray-500">Serveurs déployés dans l'Union Européenne</p>
                <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline text-xs">Politique de confidentialité Vercel</a>
              </div>
              <div>
                <p className="font-medium">Base de données — Supabase Inc.</p>
                <p className="text-gray-500">970 Toa Payoh North, Singapour — Données hébergées dans l'Union Européenne (Frankfurt)</p>
                <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline text-xs">Politique de confidentialité Supabase</a>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Propriété intellectuelle</h2>
            <p className="text-sm">L'ensemble du contenu de QalioFlex (textes, graphismes, logo, icônes, interface, code source) est la propriété exclusive de SARL EXSENCO, protégé par le droit d'auteur français et les conventions internationales. Toute reproduction partielle ou totale sans autorisation écrite préalable est strictement interdite et constitue une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la Propriété Intellectuelle.</p>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Données personnelles</h2>
            <p className="text-sm">Le traitement des données personnelles est détaillé dans notre <Link to="/confidentialite" className="text-exsenco-blue hover:underline">Politique de confidentialité</Link> et notre page <Link to="/rgpd" className="text-exsenco-blue hover:underline">RGPD</Link>. Conformément à la loi Informatique et Libertés et au RGPD (UE 2016/679), vous disposez d'un droit d'accès, de rectification et de suppression de vos données.</p>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Cookies</h2>
            <p className="text-sm">QalioFlex utilise uniquement des cookies strictement nécessaires au fonctionnement de l'application (session d'authentification). Aucun cookie publicitaire ou de tracking tiers n'est déposé. Ces cookies ne nécessitent pas de consentement préalable (Article 5.3 de la Directive 2002/58/CE).</p>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Limitation de responsabilité</h2>
            <p className="text-sm">SARL EXSENCO s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur QalioFlex. Toutefois, elle ne peut garantir l'exactitude, la précision ou l'exhaustivité des informations. EXSENCO décline toute responsabilité pour les dommages directs ou indirects résultant de l'utilisation de la plateforme.</p>
          </section>

          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-semibold" style={{ color: "#25245e" }}>Droit applicable et juridiction</h2>
            <p className="text-sm">Les présentes mentions légales sont soumises au droit français. En cas de litige non résolu à l'amiable, les tribunaux du ressort de la Cour d'Appel de <strong>Tours</strong> sont seuls compétents.</p>
          </section>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default MentionsLegales;
