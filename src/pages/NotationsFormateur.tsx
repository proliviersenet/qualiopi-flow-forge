import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

// Module de notation des formateurs (juillet 2026) — tableau de bord privé :
// moyenne, évolution dans le temps, verbatims. Agrège deux sources qui
// partagent le même questionnaire (evaluation_questions, type "formateur")
// mais des tables différentes :
//   - stagiaires.reponses_evaluation_formateur (notes 0-4 par question + commentaire)
//   - evaluations_formateur_clients.reponses (même format, rempli par le client)
// La note est affichée convertie sur 5 (comme dans StagiairesList.tsx) pour
// rester lisible, même si le questionnaire sous-jacent note chaque critère
// de 0 à 4.
interface Verbatim {
  id: string;
  auteur: string;
  auteurType: "stagiaire" | "client";
  formationTitre: string;
  date: string;
  commentaire: string;
  noteSur5: number | null;
}

interface PointMensuel {
  mois: string;
  moyenne: number;
  nbRepondants: number;
}

const NotationsFormateur = () => {
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [moyenneGlobale, setMoyenneGlobale] = useState<number | null>(null);
  const [nbRepondants, setNbRepondants] = useState(0);
  const [evolution, setEvolution] = useState<PointMensuel[]>([]);
  const [verbatims, setVerbatims] = useState<Verbatim[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      try {
        setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

        const { data: profile } = await supabase
          .from("profiles")
          .select("organisme_id")
          .eq("id", authSession.user.id)
          .single();

        if (!profile?.organisme_id) { setLoading(false); return; }
        const organismeId = profile.organisme_id as string;

        // Toutes les notes individuelles (0-4), avec la date de fin de
        // session pour construire l'évolution mensuelle, et le commentaire
        // pour les verbatims.
        type NoteEntry = { valeurs: number[]; commentaire: string | null; date: string | null; formationTitre: string; auteur: string; auteurType: "stagiaire" | "client"; id: string };
        const entries: NoteEntry[] = [];

        const { data: stagiairesData } = await supabase
          .from("stagiaires")
          .select(`
            id, nom, prenom, reponses_evaluation_formateur,
            sessions:session_id ( date_fin, formations:formation_id ( titre, organisme_id ) )
          `);

        (stagiairesData || []).forEach((s: Record<string, unknown>) => {
          const session = s.sessions as Record<string, unknown> | null;
          const formation = session?.formations as Record<string, unknown> | null;
          if (!formation || formation.organisme_id !== organismeId) return;
          const rep = s.reponses_evaluation_formateur as { notes?: Record<string, number>; commentaire?: string | null; submitted_at?: string } | null;
          if (!rep?.notes) return;
          const valeurs = Object.values(rep.notes).filter((v) => typeof v === "number") as number[];
          if (valeurs.length === 0) return;
          entries.push({
            valeurs,
            commentaire: rep.commentaire || null,
            date: (rep.submitted_at as string) || (session?.date_fin as string) || null,
            formationTitre: (formation.titre as string) || "",
            auteur: `${s.prenom} ${s.nom}`,
            auteurType: "stagiaire",
            id: `stagiaire-${s.id}`,
          });
        });

        const { data: clientsEvalData } = await supabase
          .from("evaluations_formateur_clients")
          .select(`
            id, reponses,
            sessions:session_id ( date_fin, formations:formation_id ( titre, organisme_id ) ),
            clients:client_id ( raison_sociale, contact_nom )
          `);

        (clientsEvalData || []).forEach((e: Record<string, unknown>) => {
          const session = e.sessions as Record<string, unknown> | null;
          const formation = session?.formations as Record<string, unknown> | null;
          if (!formation || formation.organisme_id !== organismeId) return;
          const rep = e.reponses as { notes?: Record<string, number>; commentaire?: string | null; submitted_at?: string } | null;
          if (!rep?.notes) return;
          const valeurs = Object.values(rep.notes).filter((v) => typeof v === "number") as number[];
          if (valeurs.length === 0) return;
          const client = e.clients as Record<string, unknown> | null;
          entries.push({
            valeurs,
            commentaire: rep.commentaire || null,
            date: (rep.submitted_at as string) || (session?.date_fin as string) || null,
            formationTitre: (formation.titre as string) || "",
            auteur: (client?.contact_nom as string) || (client?.raison_sociale as string) || "Client",
            auteurType: "client",
            id: `client-${e.id}`,
          });
        });

        // Moyenne globale (toutes questions confondues), convertie sur 5.
        const toutesValeurs = entries.flatMap((e) => e.valeurs);
        if (toutesValeurs.length > 0) {
          const moyenneSur4 = toutesValeurs.reduce((a, b) => a + b, 0) / toutesValeurs.length;
          setMoyenneGlobale((moyenneSur4 / 4) * 5);
        }
        setNbRepondants(entries.length);

        // Évolution mensuelle.
        const parMois = new Map<string, number[]>();
        entries.forEach((e) => {
          if (!e.date) return;
          const mois = e.date.slice(0, 7); // YYYY-MM
          const arr = parMois.get(mois) || [];
          parMois.set(mois, [...arr, ...e.valeurs]);
        });
        const pointsEvolution: PointMensuel[] = Array.from(parMois.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mois, valeurs]) => ({
            mois: new Date(mois + "-01").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
            moyenne: Math.round(((valeurs.reduce((a, b) => a + b, 0) / valeurs.length) / 4) * 5 * 10) / 10,
            nbRepondants: valeurs.length,
          }));
        setEvolution(pointsEvolution);

        // Verbatims (commentaires non vides), les plus récents en premier.
        const verbatimsList: Verbatim[] = entries
          .filter((e) => e.commentaire && e.commentaire.trim().length > 0)
          .map((e) => ({
            id: e.id,
            auteur: e.auteur,
            auteurType: e.auteurType,
            formationTitre: e.formationTitre,
            date: e.date ? new Date(e.date).toLocaleDateString("fr-FR") : "",
            commentaire: e.commentaire || "",
            noteSur5: e.valeurs.length > 0 ? Math.round(((e.valeurs.reduce((a, b) => a + b, 0) / e.valeurs.length) / 4) * 5 * 10) / 10 : null,
          }))
          .sort((a, b) => (b.date > a.date ? 1 : -1));
        setVerbatims(verbatimsList);
      } catch (err) {
        console.error("Erreur init NotationsFormateur:", err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [authSession, authLoading, navigate]);

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#25245e" }}>🧑‍🏫 Notation des formateurs</h1>
          <p className="text-sm text-gray-500 mb-6">Moyenne, évolution et verbatims des évaluations reçues (stagiaires + clients).</p>

          {loading ? (
            <p className="text-gray-400">Chargement...</p>
          ) : nbRepondants === 0 ? (
            <Card><CardContent className="pt-6 text-center text-gray-500">
              Aucune évaluation reçue pour l'instant. Les évaluations sont envoyées automatiquement à la fin de chaque formation.
            </CardContent></Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 font-normal">Note moyenne globale</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold" style={{ color: "#f2901e" }}>
                      {moyenneGlobale !== null ? moyenneGlobale.toFixed(1) : "—"} <span className="text-lg text-gray-400">/ 5</span>
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 font-normal">Évaluations reçues</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-4xl font-bold" style={{ color: "#25245e" }}>{nbRepondants}</p>
                  </CardContent>
                </Card>
              </div>

              {evolution.length > 1 && (
                <Card className="mb-6">
                  <CardHeader><CardTitle className="text-base" style={{ color: "#25245e" }}>Évolution mensuelle</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={evolution} margin={{ top: 4, right: 14, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="mois" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                        <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                        <Tooltip />
                        <Bar dataKey="moyenne" fill="#f2901e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle className="text-base" style={{ color: "#25245e" }}>Verbatims ({verbatims.length})</CardTitle></CardHeader>
                <CardContent>
                  {verbatims.length === 0 ? (
                    <p className="text-sm text-gray-400">Aucun commentaire laissé pour l'instant.</p>
                  ) : (
                    <div className="space-y-4">
                      {verbatims.map((v) => (
                        <div key={v.id} className="border-b border-gray-100 pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-700">
                              {v.auteur} <span className="text-xs font-normal text-gray-400">({v.auteurType === "client" ? "client" : "stagiaire"})</span>
                            </p>
                            {v.noteSur5 !== null && <span className="text-xs font-bold" style={{ color: "#f2901e" }}>{v.noteSur5.toFixed(1)}/5</span>}
                          </div>
                          <p className="text-xs text-gray-400 mb-1">{v.formationTitre} — {v.date}</p>
                          <p className="text-sm text-gray-600 italic">"{v.commentaire}"</p>
                        </div>
                      ))}
                    </div>
                  )}
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

export default NotationsFormateur;
