import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Statut réglementaire Qualiopi — affiche le résultat du dernier contrôle
// automatique (tâche planifiée mensuelle) comparant le référentiel national
// qualité en ligne à la dernière baseline connue, ainsi que l'historique des
// contrôles précédents. Lecture seule : les écritures se font uniquement via
// l'Edge Function veille-qualiopi-log (clé service_role), jamais depuis ce
// composant — voir docs/VEILLE_QUALIOPI.md pour le fonctionnement complet.
interface LogEntry {
  id: string;
  date_verification: string;
  version_referentiel: string;
  date_maj_referentiel: string | null;
  statut: "inchange" | "changement_detecte";
  resume: string | null;
  lien_pdf: string | null;
}

const VeilleQualiopi = () => {
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const role = authSession.user.user_metadata?.role;
    if (role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      try {
        setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

        const { data, error } = await supabase
          .from("veille_qualiopi_log")
          .select("id, date_verification, version_referentiel, date_maj_referentiel, statut, resume, lien_pdf")
          .order("date_verification", { ascending: false })
          .limit(24);

        if (error) throw error;
        setLogs((data || []) as LogEntry[]);
      } catch (err) {
        console.error("Erreur init VeilleQualiopi:", err);
        setErreur("Impossible de charger le statut de la veille pour le moment.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [authSession, authLoading, navigate]);

  const dernier = logs[0] || null;

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#25245e" }}>📡 Statut réglementaire Qualiopi</h1>
          <p className="text-sm text-gray-500 mb-6">
            Suivi automatique du référentiel national qualité (RNQ) — un contrôle est effectué chaque mois,
            comparé à la dernière version connue.
          </p>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : erreur ? (
            <Card><CardContent className="pt-6 text-center text-gray-500">{erreur}</CardContent></Card>
          ) : !dernier ? (
            <Card><CardContent className="pt-6 text-center text-gray-500">
              Aucun contrôle enregistré pour le moment. Le premier contrôle automatique s'affichera ici après sa prochaine exécution.
            </CardContent></Card>
          ) : (
            <>
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base" style={{ color: "#25245e" }}>Version en vigueur</CardTitle>
                    {dernier.statut === "changement_detecte" ? (
                      <Badge className="bg-orange-100 text-orange-700">⚠️ Changement détecté</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700">✓ À jour</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold mb-1" style={{ color: "#f2901e" }}>{dernier.version_referentiel}</p>
                  {dernier.date_maj_referentiel && (
                    <p className="text-sm text-gray-500 mb-2">
                      Mise à jour officielle du {new Date(dernier.date_maj_referentiel).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                  {dernier.resume && (
                    <p className="text-sm text-gray-600 mb-2">{dernier.resume}</p>
                  )}
                  {dernier.lien_pdf && (
                    <a href={dernier.lien_pdf} target="_blank" rel="noreferrer" className="text-sm text-exsenco-blue hover:underline">
                      Voir le référentiel officiel &rarr;
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-3">
                    Dernier contrôle : {new Date(dernier.date_verification).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base" style={{ color: "#25245e" }}>Historique des contrôles</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {logs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 flex-wrap gap-1">
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{l.version_referentiel}</p>
                          <p className="text-xs text-gray-400">{new Date(l.date_verification).toLocaleDateString("fr-FR")}</p>
                        </div>
                        {l.statut === "changement_detecte" ? (
                          <Badge className="bg-orange-100 text-orange-700 text-xs">Changement</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700 text-xs">Inchangé</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VeilleQualiopi;
