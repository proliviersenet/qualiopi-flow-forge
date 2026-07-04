import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Confidentialite = () => (
  <div className="flex flex-col min-h-screen">
    <Header user={{ name: "", email: "", profileImage: "" }} onLogout={() => {}} />
    <main className="flex-grow bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link to="/" className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
        <h1 className="text-3xl font-bold mt-4 mb-8" style={{ color: "#25245e" }}>Politique de confidentialité</h1>
        <div className="prose prose-gray max-w-none space-y-6 text-gray-700">
          <p className="text-sm text-gray-400">Dernière mise à jour : 4 juillet 2026</p>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>1. Responsable du traitement</h2>
            <p>QalioFlex est édité par <strong>SASU EXSENCO</strong>, dont le siège social est situé au 80 rue du Nouveau Bois, 37550 Saint-Avertin. SIRET : 892 787 458 000 17. Contact : <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline">olivier.senet@prospactive.com</a></p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>2. Données collectées</h2>
            <p>Dans le cadre de l'utilisation de QalioFlex, nous collectons :</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Données d'identification : nom, prénom, adresse email, numéro de téléphone</li>
              <li>Données professionnelles : raison sociale, SIRET, NDA, adresse de l'organisme</li>
              <li>Données de formation : formations, sessions, stagiaires, BPF</li>
              <li>Données de connexion : adresse IP, logs d'accès, cookies de session</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>3. Finalités du traitement</h2>
            <p>Vos données sont traitées pour :</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>Fournir et améliorer les services QalioFlex</li>
              <li>Assurer la gestion de votre compte utilisateur</li>
              <li>Garantir la conformité avec le référentiel Qualiopi</li>
              <li>Envoyer des notifications liées à votre activité (relances, signatures)</li>
              <li>Respecter nos obligations légales et réglementaires</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>4. Base légale</h2>
            <p>Le traitement repose sur l'exécution du contrat (conditions d'utilisation acceptées lors de l'inscription) et, le cas échéant, sur votre consentement explicite ou nos obligations légales.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>5. Hébergement et sécurité</h2>
            <p>Vos données sont hébergées sur les serveurs <strong>Supabase (Union Européenne)</strong>, conformes au RGPD. La plateforme est déployée via <strong>Vercel</strong>. Les communications sont chiffrées en TLS. Les mots de passe sont hachés (bcrypt).</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>6. Durée de conservation</h2>
            <p>Vos données sont conservées pendant toute la durée de votre abonnement actif, puis 3 ans après la résiliation de votre compte, sauf obligation légale contraire.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#25245e" }}>7. Vos droits</h2>
            <p>Conformément au RGPD (Règlement 2016/679), vous disposez des droits suivants :</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>Accès</strong> : obtenir une copie de vos données personnelles</li>
              <li><strong>Rectification</strong> : corriger des données inexactes</li>
              <li><strong>Effacement</strong> : demander la suppression de vos données</li>
              <li><strong>Portabilité</strong> : recevoir vos données dans un format structuré</li>
              <li><strong>Opposition</strong> : vous opposer à certains traitements</li>
            </ul>
            <p className="mt-2">Pour exercer ces droits : <a href="mailto:olivier.senet@prospactive.com" className="text-exsenco-blue hover:underline">olivier.senet@prospactive.com</a></p>
            <p className="mt-2">En cas de litige non résolu, vous pouvez saisir la <strong>CNIL</strong> : <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-exsenco-blue hover:underline">www.cnil.fr</a></p>
          </section>
        </div>
      </div>
    </main>
    <Footer />
  </div>
);

export default Confidentialite;
