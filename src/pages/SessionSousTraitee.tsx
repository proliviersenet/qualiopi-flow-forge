import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StagiairesList from "@/components/StagiairesList";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { extractFunctionErrorMessage } from "@/lib/functionsError";
import { useToast } from "@/hooks/use-toast";

// Chantier "sous-traitance" (28/08) : espace de travail d'un formateur sous-traitant
// pour UNE session qui lui a été confiée par un autre organisme. Volontairement plus
// restreint que ClientDetail.tsx : pas de devis/convention (documents commerciaux
// entre le formateur qui a vendu la formation et son client — hors du périmètre du
// sous-traitant), pas de suppression de session, pas d'affectation de formation. On
// retrouve en revanche tout ce qu'il faut pour ANIMER la session : livret, émargement,
// et la liste des stagiaires (questionnaires, attestation, relances) via StagiairesList,
// exactement comme un formateur classique — les policies RLS ajoutées par la migration
// "sous_traitance_sessions" scopent cet accès à cette session précise.

interface SessionInfo {
  id: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  formation_id: string;
  formation: { titre: string; duree: string } | null;
  client: { raison_sociale: string; adresse: string } | null;
}

const DOCS_CONFIG = [
  { type: "livret", label: "📘 Livret d'accueil", fn: "generer-livret" },
  { type: "emargement", label: "✍️ Feuille d'émargement", fn: "generer-emargement" },
] as const;

const SessionSousTraitee = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [organismeDemandeurNom, setOrganismeDemandeurNom] = useState("");
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [generatingDoc, setGeneratingDoc] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

      // La lecture de "sessions" est scopée par RLS aux sessions où je suis
      // sous-traitant actif — si elle échoue/retourne vide, je n'ai pas (ou plus)
      // accès à cette session.
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("id, date_debut, date_fin, lieu, formation_id, formation:formation_id(titre, duree), client:client_id(raison_sociale, adresse)")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionData) {
        setSession(sessionData as unknown as SessionInfo);

        const { data: docsData } = await supabase
          .from("documents_formation")
          .select("type, contenu_html")
          .eq("session_id", sessionId)
          .in("type", DOCS_CONFIG.map(c => c.type));
        const map: Record<string, string> = {};
        (docsData as { type: string; contenu_html: string | null }[] || []).forEach(d => { if (d.contenu_html) map[d.type] = d.contenu_html; });
        setDocs(map);

        const { data: st } = await supabase
          .from("sessions_sous_traitance")
          .select("organisme_demandeur_id")
          .eq("session_id", sessionId)
          .eq("statut", "actif")
          .maybeSingle();
        if (st?.organisme_demandeur_id) {
          const { data: org } = await supabase.from("organismes").select("raison_sociale").eq("id", st.organisme_demandeur_id).maybeSingle();
          setOrganismeDemandeurNom(org?.raison_sociale || "");
        }
      }
      setLoading(false);
    };
    init();
  }, [authLoading, authSession, navigate, sessionId]);

  const genererDocument = async (type: string, fn: string) => {
    if (!sessionId) return;
    setGeneratingDoc(type);
    const { data, error } = await supabase.functions.invoke(fn, { body: { session_id: sessionId } });
    setGeneratingDoc(null);
    if (error || data?.error) {
      const message = data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur de génération.");
      toast({ title: "Erreur génération", description: message, variant: "destructive" });
      return;
    }
    setDocs(prev => ({ ...prev, [type]: data.contenu_html }));
    toast({ title: "✅ Document généré" });
  };

  const voirDocument = (type: string) => {
    const html = docs[type];
    if (!html) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 max-w-4xl">
          {loading ? (
            <div className="text-center py-16 text-gray-400">Chargement...</div>
          ) : !session ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">
                <p className="text-3xl mb-3">🔒</p>
                <p>Vous n'avez pas (ou plus) accès à cette session.</p>
                <Link to="/dashboard" className="text-exsenco-blue hover:underline text-sm mt-2 inline-block">← Retour au tableau de bord</Link>
              </CardContent>
            </Card>
          ) : (
            <>
              <Link to="/dashboard" className="text-sm text-gray-500 hover:underline mb-4 inline-block">← Retour au tableau de bord</Link>

              <Card className="mb-6">
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <h1 className="text-xl font-bold" style={{ color: "#25245e" }}>{session.formation?.titre || "Formation"}</h1>
                    <Badge className="bg-purple-100 text-purple-700">🤝 Sous-traitance{organismeDemandeurNom ? ` — ${organismeDemandeurNom}` : ""}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-3">
                    {session.date_debut && <span>📅 Début : {new Date(session.date_debut).toLocaleDateString("fr-FR")}</span>}
                    {session.date_fin && <span>📅 Fin : {new Date(session.date_fin).toLocaleDateString("fr-FR")}</span>}
                    {session.lieu && <span>📍 {session.lieu}</span>}
                  </div>
                  {session.client && (
                    <p className="text-sm text-gray-600">
                      🏢 Client : <strong>{session.client.raison_sociale}</strong>{session.client.adresse ? ` — ${session.client.adresse}` : ""}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="mb-6">
                <CardContent className="pt-5 space-y-2">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Documents pédagogiques</p>
                  {DOCS_CONFIG.map(({ type, label, fn }) => {
                    const enCours = generatingDoc === type;
                    const html = docs[type];
                    return (
                      <div key={type} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium text-gray-700">{label}</p>
                          <p className="text-xs text-gray-400">{enCours ? "Génération en cours..." : html ? "Généré — visible par le client" : "À générer avant le début de la session"}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          {enCours && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                          <Button size="sm" variant="outline" disabled={enCours} onClick={() => genererDocument(type, fn)}>
                            {enCours ? "Génération..." : html ? "Regénérer" : "Générer"}
                          </Button>
                          {html && (
                            <Button size="sm" style={{ background: "#25245e", color: "#fff" }} onClick={() => voirDocument(type)}>Voir</Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <StagiairesList
                sessionId={session.id}
                canRelance={true}
                envoye_par="formateur"
                canal="les_deux"
                formationTitre={session.formation?.titre || ""}
                showSynthese={true}
              />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SessionSousTraitee;
