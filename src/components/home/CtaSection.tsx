
import { Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";

const CtaSection = () => {
  return (
    <section className="py-16 bg-blue-600 text-white">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-6">Prêt à simplifier votre gestion administrative ?</h2>
        <p className="text-xl text-blue-100 mb-8 max-w-3xl mx-auto">
          Rejoignez des centaines de formateurs qui ont déjà transformé leur façon de gérer leurs formations avec FormationPro.
        </p>
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
          <Link to="/register">
            <Button size="lg" variant="default" className="bg-white text-blue-600 hover:bg-blue-50">
              S'inscrire gratuitement
            </Button>
          </Link>
          <Link to="/mockup">
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-blue-700">
              Voir la maquette
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default CtaSection;
