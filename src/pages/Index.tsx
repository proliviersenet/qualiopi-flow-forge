import "@fontsource-variable/bricolage-grotesque";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  BandeauExsenco, HeroAccueil, TechnologiesAccueil, ParcoursAccueil, FonctionnalitesAccueil,
  TarifsAccueil, TemoignagesAccueil, FaqAccueil, ExsencoAccueil, CtaFinalAccueil,
} from '@/components/home/Accueil';

// Page d'accueil — refonte du 14/11/2026 (stratégie tarifaire, essai gratuit,
// témoignages, technologies, bandeau ExSenCo). Anciennes sections (HeroSection,
// FeaturesSection, TargetAudienceSection, CtaSection) conservées dans
// src/components/home mais plus utilisées.
const Index = () => {
  // Liens /#tarifs, /#fonctionnalites : défilement vers la section visée
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);

  return (
    <div className="flex flex-col min-h-screen">
      <BandeauExsenco />
      <Header />
      <main className="flex-grow">
        <HeroAccueil />
        <TechnologiesAccueil />
        <ParcoursAccueil />
        <FonctionnalitesAccueil />
        <TarifsAccueil />
        <TemoignagesAccueil />
        <FaqAccueil />
        <ExsencoAccueil />
        <CtaFinalAccueil />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
