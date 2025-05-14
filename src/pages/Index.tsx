
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HeroSection from '@/components/home/HeroSection';
import FeaturesSection from '@/components/home/FeaturesSection';
import TargetAudienceSection from '@/components/home/TargetAudienceSection';
import CtaSection from '@/components/home/CtaSection';

const Index = () => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        <HeroSection />
        <FeaturesSection />
        <TargetAudienceSection />
        <CtaSection />
      </main>

      <Footer />
    </div>
  );
};

export default Index;
