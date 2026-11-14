import { Link } from "react-router-dom";
import PageLegale from "@/components/PageLegale";
import { CONTACT_EMAIL, EXSENCO_URL } from "@/lib/offre";

// Mentions légales (LCEN) — mise à jour du 14/11/2026 : email de contact,
// TVA intracommunautaire, prestataire de paiement, juridiction.
// À compléter par Olivier : capital social et numéro RCS (voir BAT).

// BAT : informations à fournir par Olivier (surlignées tant qu'elles manquent)
const ACompleter = ({ children }: { children: React.ReactNode }) => (
  <mark className="rounded bg-amber-200 px-1 text-amber-950">{children}</mark>
);

const Bloc = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm space-y-2 text-sm">
    <h2 className="text-lg font-semibold mb-1" style={{ color: "#25245e" }}>{titre}</h2>
    {children}
  </section>
);

const MentionsLegales = () => (
  <PageLegale
    titre="Mentions légales"
    miseAJour="14 novembre 2026"
    introduction={<p className="text-sm text-gray-500">Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).</p>}
  >
    <div className="space-y-4">
      <Bloc titre="Éditeur">
        <p><strong>Raison sociale :</strong> SARL EXSENCO (société à responsabilité limitée) au capital de <ACompleter>à compléter</ACompleter> €</p>
        <p><strong>RCS :</strong> Tours <ACompleter>numéro à confirmer</ACompleter></p>
        <p><strong>Siège social :</strong> 80 rue du Nouveau Bois, 37550 Saint-Avertin, France</p>
        <p><strong>SIRET :</strong> 892 787 458 00017</p>
        <p><strong>TVA intracommunautaire :</strong> FR35 892787458</p>
        <p><strong>Code NAF :</strong> <ACompleter>à compléter (code APE de l'avis de situation INSEE)</ACompleter></p>
        <p><strong>Directeur de la publication :</strong> Olivier Senet</p>
        <p><strong>Email :</strong> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> · <strong>Téléphone :</strong> <a href="tel:+33607467409">06 07 46 74 09</a></p>
        <p><strong>Site de l'éditeur :</strong> <a href={EXSENCO_URL} target="_blank" rel="noopener noreferrer">exsenco.fr</a></p>
      </Bloc>

      <Bloc titre="Hébergement">
        <p><strong>Application web :</strong> Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis.</p>
        <p><strong>Base de données :</strong> Supabase Inc., données hébergées dans l'Union européenne (Francfort, Allemagne).</p>
      </Bloc>

      <Bloc titre="Paiement">
        <p>Les paiements par carte bancaire sont traités par Stripe Payments Europe Ltd, 1 Grand Canal Street Lower, Dublin 2, Irlande. ExSenCo n'a jamais accès aux numéros de carte.</p>
      </Bloc>

      <Bloc titre="Conditions et données personnelles">
        <p>
          L'utilisation de QualioFlex est régie par les <Link to="/conditions">conditions générales d'utilisation et de vente</Link>.
          Le traitement des données personnelles est décrit dans la <Link to="/confidentialite">politique de confidentialité</Link> et
          la page <Link to="/rgpd">RGPD</Link>. QualioFlex n'utilise ni cookie publicitaire ni outil de mesure d'audience.
        </p>
      </Bloc>

      <Bloc titre="Propriété intellectuelle">
        <p>
          L'ensemble des éléments de QualioFlex (textes, graphismes, logo, interface, code source) est la propriété exclusive de
          SARL EXSENCO. Toute reproduction sans autorisation écrite préalable est interdite (articles L.335-2 et suivants du Code
          de la propriété intellectuelle). Les noms Stripe, DocuSign, Claude, Supabase, Vercel et Brevo cités sur le site sont
          des marques de leurs titulaires respectifs, mentionnées pour décrire les services techniques utilisés.
        </p>
      </Bloc>

      <Bloc titre="Droit applicable">
        <p>Les présentes mentions sont soumises au droit français. À défaut de solution amiable, tout litige relève de la compétence des tribunaux de Tours.</p>
      </Bloc>
    </div>
  </PageLegale>
);

export default MentionsLegales;
