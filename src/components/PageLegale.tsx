import { ReactNode } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";

// Mise en page commune des pages légales et d'aide (refonte du 14/11/2026) :
// lien retour adapté au profil, titre, date de mise à jour, sommaire optionnel.
type Props = {
  titre: string;
  miseAJour?: string;
  introduction?: ReactNode;
  sommaire?: { id: string; titre: string }[];
  children: ReactNode;
};

export const H2 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h2 id={id} className="text-xl font-semibold mt-10 mb-3 scroll-mt-24" style={{ color: "#25245e" }}>{children}</h2>
);
export const H3 = ({ children }: { children: ReactNode }) => (
  <h3 className="font-semibold text-gray-900 mt-5 mb-2">{children}</h3>
);

const PageLegale = ({ titre, miseAJour, introduction, sommaire, children }: Props) => {
  const { session, user: authUser } = useAuth();
  const role = authUser?.user_metadata?.role;
  const retourHref = session ? (role === "client" ? "/espace-client" : "/dashboard") : "/";
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <Link to={retourHref} className="text-exsenco-blue hover:text-blue-800 text-sm">&larr; Retour</Link>
          <h1 className="text-3xl font-bold mt-4" style={{ color: "#25245e" }}>{titre}</h1>
          {miseAJour && <p className="text-sm text-gray-500 mt-2">Dernière mise à jour : {miseAJour}</p>}
          {introduction && <div className="mt-6 text-gray-700 leading-relaxed">{introduction}</div>}
          {sommaire && sommaire.length > 0 && (
            <nav aria-label="Sommaire" className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
              <p className="font-semibold text-gray-900 mb-2">Sommaire</p>
              <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm list-decimal list-inside">
                {sommaire.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`} className="text-exsenco-blue hover:underline">{s.titre}</a></li>
                ))}
              </ol>
            </nav>
          )}
          <div className="mt-4 text-gray-700 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-exsenco-blue [&_a:hover]:underline">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PageLegale;
