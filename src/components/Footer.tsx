
import { Link } from 'react-router-dom';
import Logo from '@/components/Logo';

// Profil LinkedIn personnel d'Olivier, en attendant la création d'une page
// LinkedIn dédiée à QualioFlex (juillet 2026).
const LINKEDIN_URL = "https://www.linkedin.com/in/%F0%9F%94%B4-olivier-senet-dirco-externalis%C3%A9-9350786a/";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-50 border-t border-gray-200">
      <div className="container mx-auto px-4 py-8">
        <div className="md:flex md:justify-between">
          <div className="mb-6 md:mb-0">
            <Link to="/" className="flex items-center">
              <Logo size={24} withWordmark />
            </Link>
            <p className="mt-2 text-sm text-gray-600 max-w-md">
              La plateforme qui simplifie la gestion administrative des formations
              et garantit la conformité avec le référentiel Qualiopi.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 sm:gap-6 sm:grid-cols-3">
            <div>
              <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase">Ressources</h2>
              <ul className="text-gray-600 space-y-2">
                <li>
                  <Link to="/aide" className="hover:underline">Centre d'aide</Link>
                </li>
                <li>
                  <Link to="/documentation" className="hover:underline">Documentation</Link>
                </li>
                <li>
                  <Link to="/qualiopi" className="hover:underline">Référentiel Qualiopi</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase">Légal</h2>
              <ul className="text-gray-600 space-y-2">
                <li>
                  <Link to="/confidentialite" className="hover:underline">Politique de confidentialité</Link>
                </li>
                <li>
                  <Link to="/conditions" className="hover:underline">Conditions d'utilisation</Link>
                </li>
                <li>
                  <Link to="/rgpd" className="hover:underline">RGPD</Link>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="mb-6 text-sm font-semibold text-gray-900 uppercase">Contact</h2>
              <ul className="text-gray-600 space-y-2">
                <li>
                  <a href="mailto:olivier.senet@prospactive.com" className="hover:underline">Email</a>
                </li>
                <li>
                  <Link to="/contact" className="hover:underline">Formulaire de contact</Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <hr className="my-6 border-gray-200" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-gray-500">© {currentYear} QualioFlex by SARL EXSENCO. Tous droits réservés.</span>
          <div className="flex gap-4 mt-2 md:mt-0">
            <Link to="/mentions-legales" className="text-xs text-gray-400 hover:underline">Mentions légales</Link>
            <Link to="/confidentialite" className="text-xs text-gray-400 hover:underline">Confidentialité</Link>
            <Link to="/rgpd" className="text-xs text-gray-400 hover:underline">RGPD</Link>
          </div>
          <div className="flex mt-4 space-x-6 md:mt-0">
            {/* Facebook et Twitter retirés (juillet 2026, à la demande d'Olivier — pas de
                comptes existants sur ces réseaux). LinkedIn pointe vers son profil perso en
                attendant la création d'une page LinkedIn dédiée à QualioFlex. */}
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-gray-900">
              <span className="sr-only">LinkedIn</span>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
