import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";

const Factures = () => {
  const { session, user: authUser } = useAuth();
  const role = authUser?.user_metadata?.role;
  const retourHref = session ? (role === "client" ? "/espace-client" : "/dashboard") : "/";

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          <Link to={retourHref} className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold mt-4 mb-8" style={{ color: "#25245e" }}>Factures</h1>

          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-4xl mb-4">🚧</p>
              <p className="text-gray-700 font-semibold">Bientôt disponible</p>
              <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
                Vos factures mensuelles apparaîtront ici automatiquement une fois la facturation QualioFlex activée.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Factures;
