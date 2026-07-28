import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpPopup from "@/components/HelpPopup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Cette page n'est plus une liste de "documents" génériques (l'ancienne version
// interrogeait des tables `documents`/`signatures` qui n'existent plus dans le
// schéma actuel — lien mort dans le menu). Elle devient un moteur de recherche
// de dossiers pour préparer un contrôle Qualiopi : le formateur sélectionne les
// sessions concernées par l'audit et obtient en un coup d'œil, par dossier, la
// complétude documentaire (formation + session + par stagiaire), imprimable.

interface Formation {
  id: string;
  titre: string;
}

interface SessionRow {
  id: string;
  formation_id: string;
  client_id: string;
  date_debut: string | null;
  date_fin: string | null;
  lieu: string | null;
  statut: string;
  formation?: { titre: string };
  client?: { raison_sociale: string };
}

interface StagiaireRow {
  id: string;
  session_id: string;
  nom: string;
  prenom: string;
  consentement_email: boolean | null;
  consentement_sms: boolean | null;
  doc_questionnaire_avant: string | null;
  doc_questionnaire_apres: string | null;
}

const DOCS_FORMATION = [
  { type: "support", label: "Support pédagogique" },
  { type: "programme", label: "Programme" },
];
const DOCS_SESSION = [
  { type: "livret", label: "Livret d'accueil" },
  { type: "emargement", label: "Feuille d'émargement" },
  { type: "devis", label: "Devis" },
];

const statutLabel = (s: string) => {
  const map: Record<string, string> = {
    planifiee: "Planifiée", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée",
  };
  return map[s] || s;
};

const Documents = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Filtres de recherche des dossiers
  const [filtreFormation, setFiltreFormation] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");

  // Dossiers (sessions) sélectionnés comme concernés par l'audit
  const [selectionnes, setSelectionnes] = useState<Set<string>>(new Set());

  // Complétude chargée à la demande pour les dossiers sélectionnés
  const [docsFormation, setDocsFormation] = useState<Record<string, Record<string, boolean>>>({});
  const [docsSession, setDocsSession] = useState<Record<string, Record<string, boolean>>>({});
  const [stagiairesParSession, setStagiairesParSession] = useState<Record<string, StagiaireRow[]>>({});
  const [attestationsParStagiaire, setAttestationsParStagiaire] = useState<Record<string, boolean>>({});
  const [analyseFaite, setAnalyseFaite] = useState(false);
  const [analysing, setAnalysing] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }

    const init = async () => {
      setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

      const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", authSession.user.id).single();
      if (!profile?.organisme_id) { setLoading(false); return; }

      const { data: formationsData } = await supabase
        .from("formations")
        .select("id, titre")
        .eq("organisme_id", profile.organisme_id)
        .order("titre");
      const formationsList = (formationsData as Formation[]) || [];
      setFormations(formationsList);

      // On scope explicitement aux formations de CET organisme (via formation_id)
      // plutôt que de compter sur une éventuelle RLS de la table sessions — même
      // logique que ClientDetail.tsx qui, lui, scope par client_id déjà vérifié.
      if (formationsList.length > 0) {
        const { data: sessionsData } = await supabase
          .from("sessions")
          .select("id, formation_id, client_id, date_debut, date_fin, lieu, statut, formation:formation_id(titre), client:client_id(raison_sociale)")
          .in("formation_id", formationsList.map(f => f.id))
          .order("date_debut", { ascending: false });
        setSessions((sessionsData as unknown as SessionRow[]) || []);
      }

      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const toggleSession = (id: string) => {
    setSelectionnes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setAnalyseFaite(false);
  };

  const sessionsFiltrees = sessions.filter(s => {
    if (filtreFormation !== "toutes" && s.formation_id !== filtreFormation) return false;
    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      const titre = (s.formation?.titre || "").toLowerCase();
      const client = (s.client?.raison_sociale || "").toLowerCase();
      if (!titre.includes(q) && !client.includes(q)) return false;
    }
    return true;
  });

  const analyserCompletude = async () => {
    if (selectionnes.size === 0) {
      toast({ title: "Sélectionnez au moins un dossier", variant: "destructive" });
      return;
    }
    setAnalysing(true);

    const sessionIds = Array.from(selectionnes);
    const sessionsSelectionnees = sessions.filter(s => sessionIds.includes(s.id));
    const formationIds = [...new Set(sessionsSelectionnees.map(s => s.formation_id))];

    const [{ data: docsData }, { data: stagData }] = await Promise.all([
      supabase
        .from("documents_formation")
        .select("formation_id, session_id, stagiaire_id, type")
        .or(`formation_id.in.(${formationIds.join(",")}),session_id.in.(${sessionIds.join(",")})`),
      supabase
        .from("stagiaires")
        .select("id, session_id, nom, prenom, consentement_email, consentement_sms, doc_questionnaire_avant, doc_questionnaire_apres")
        .in("session_id", sessionIds)
        .order("nom"),
    ]);

    const df: Record<string, Record<string, boolean>> = {};
    const ds: Record<string, Record<string, boolean>> = {};
    const att: Record<string, boolean> = {};
    (docsData as { formation_id: string | null; session_id: string | null; stagiaire_id: string | null; type: string }[] || []).forEach(d => {
      if (d.stagiaire_id) { att[d.stagiaire_id] = true; return; }
      if (d.session_id) {
        if (!ds[d.session_id]) ds[d.session_id] = {};
        ds[d.session_id][d.type] = true;
      } else if (d.formation_id) {
        if (!df[d.formation_id]) df[d.formation_id] = {};
        df[d.formation_id][d.type] = true;
      }
    });
    setDocsFormation(df);
    setDocsSession(ds);
    setAttestationsParStagiaire(att);

    const byS: Record<string, StagiaireRow[]> = {};
    (stagData as StagiaireRow[] || []).forEach(s => {
      if (!byS[s.session_id]) byS[s.session_id] = [];
      byS[s.session_id].push(s);
    });
    setStagiairesParSession(byS);

    setAnalysing(false);
    setAnalyseFaite(true);
  };

  const completudePct = (sessionId: string, formationId: string) => {
    const dF = docsFormation[formationId] || {};
    const dS = docsSession[sessionId] || {};
    const items = [
      ...DOCS_FORMATION.map(d => !!dF[d.type]),
      ...DOCS_SESSION.map(d => !!dS[d.type]),
    ];
    return Math.round((items.filter(Boolean).length / items.length) * 100);
  };

  const badgePct = (pct: number) => {
    if (pct === 100) return "bg-green-100 text-green-700";
    if (pct >= 50) return "bg-orange-100 text-orange-700";
    return "bg-red-100 text-red-600";
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center bg-gray-50">
          <p className="text-gray-400">Chargement...</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <HelpPopup
        hintKey="audit_intro"
        title="Prépare ton audit Qualiopi sereinement"
        items={[
          "Cette page te permet de vérifier, dossier par dossier, que tous les documents obligatoires sont bien présents.",
          "Sélectionne les sessions concernées par le contrôle pour voir en un coup d'œil ce qui est complet et ce qui manque.",
          "Imprime le récapitulatif pour l'avoir sous la main le jour de l'audit.",
        ]}
      />

      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 no-print">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Documents — Préparation d'audit Qualiopi</h1>
              <p className="text-sm text-gray-500 mt-1">
                Sélectionnez les dossiers (sessions) concernés par le contrôle pour visualiser leur complétude documentaire en un coup d'œil, imprimable pour l'auditeur.
              </p>
            </div>
            {analyseFaite && (
              <Button onClick={() => window.print()} style={{ background: "#25245e", color: "#fff" }} className="font-bold">
                🖨️ Imprimer la vue audit
              </Button>
            )}
          </div>

          {/* Recherche et sélection des dossiers */}
          <Card className="mb-6 no-print">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <Input
                  placeholder="Rechercher par formation ou client..."
                  value={recherche}
                  onChange={e => setRecherche(e.target.value)}
                  className="flex-1"
                />
                <Select value={filtreFormation} onValueChange={setFiltreFormation}>
                  <SelectTrigger className="sm:w-64">
                    <SelectValue placeholder="Toutes les formations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="toutes">Toutes les formations</SelectItem>
                    {formations.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.titre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {sessionsFiltrees.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucun dossier ne correspond à cette recherche.</p>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {sessionsFiltrees.map(s => (
                    <label key={s.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <Checkbox checked={selectionnes.has(s.id)} onCheckedChange={() => toggleSession(s.id)} />
                      <span className="text-sm text-gray-800 flex-1">
                        <strong>{s.formation?.titre || "Formation"}</strong> — {s.client?.raison_sociale || "Client inconnu"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {s.date_debut ? new Date(s.date_debut).toLocaleDateString("fr-FR") : "—"}
                        {s.date_fin ? ` au ${new Date(s.date_fin).toLocaleDateString("fr-FR")}` : ""}
                      </span>
                      <Badge className="text-xs bg-gray-100 text-gray-600">{statutLabel(s.statut)}</Badge>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-gray-500">{selectionnes.size} dossier{selectionnes.size > 1 ? "s" : ""} sélectionné{selectionnes.size > 1 ? "s" : ""}</p>
                <Button onClick={analyserCompletude} disabled={analysing || selectionnes.size === 0} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  {analysing ? "Analyse en cours..." : "🔍 Analyser la complétude"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Résultat : une fiche de complétude par dossier sélectionné */}
          {analyseFaite && (
            <div className="space-y-4">
              {Array.from(selectionnes).map(sessionId => {
                const s = sessions.find(sess => sess.id === sessionId);
                if (!s) return null;
                const pct = completudePct(s.id, s.formation_id);
                const dF = docsFormation[s.formation_id] || {};
                const dS = docsSession[s.id] || {};
                const stags = stagiairesParSession[s.id] || [];

                return (
                  <Card key={s.id} className="break-inside-avoid">
                    <CardContent className="pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                        <div>
                          <h2 className="text-lg font-bold" style={{ color: "#25245e" }}>{s.formation?.titre || "Formation"}</h2>
                          <p className="text-sm text-gray-500">
                            Client : {s.client?.raison_sociale || "—"} · {s.date_debut ? new Date(s.date_debut).toLocaleDateString("fr-FR") : "—"}
                            {s.date_fin ? ` au ${new Date(s.date_fin).toLocaleDateString("fr-FR")}` : ""} · {s.lieu || "lieu non précisé"}
                          </p>
                        </div>
                        <Badge className={badgePct(pct)}>{pct}% complet</Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
                        {DOCS_FORMATION.map(d => (
                          <div key={d.type} className={`flex items-center gap-2 text-xs rounded px-3 py-2 ${dF[d.type] ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"}`}>
                            <span>{dF[d.type] ? "✅" : "❌"}</span><span>{d.label}</span>
                          </div>
                        ))}
                        {DOCS_SESSION.map(d => (
                          <div key={d.type} className={`flex items-center gap-2 text-xs rounded px-3 py-2 ${dS[d.type] ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"}`}>
                            <span>{dS[d.type] ? "✅" : "❌"}</span><span>{d.label}</span>
                          </div>
                        ))}
                      </div>

                      {stags.length === 0 ? (
                        <p className="text-xs text-gray-400">Aucun stagiaire importé pour ce dossier.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Stagiaire</th>
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Opt-in RGPD</th>
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Q. Avant</th>
                                <th className="text-left py-1.5 pr-3 text-gray-500 font-medium">Q. Après</th>
                                <th className="text-left py-1.5 text-gray-500 font-medium">Attestation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stags.map(st => (
                                <tr key={st.id} className="border-b border-gray-50">
                                  <td className="py-1.5 pr-3 font-medium text-gray-800">{st.prenom} {st.nom}</td>
                                  <td className="py-1.5 pr-3">
                                    {st.consentement_email === null && st.consentement_sms === null ? "⏳" : `✉️${st.consentement_email ? "✓" : "✗"} 📱${st.consentement_sms ? "✓" : "✗"}`}
                                  </td>
                                  <td className="py-1.5 pr-3">{st.doc_questionnaire_avant === "signe" ? "✅" : "❌"}</td>
                                  <td className="py-1.5 pr-3">{st.doc_questionnaire_apres === "signe" ? "✅" : "❌"}</td>
                                  <td className="py-1.5">{attestationsParStagiaire[st.id] ? "✅" : "❌"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Documents;
