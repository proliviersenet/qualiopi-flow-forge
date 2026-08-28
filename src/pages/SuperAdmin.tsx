import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { extractFunctionErrorMessage } from "@/lib/functionsError";
import { Loader2 } from "lucide-react";

// Chantier "superadmin" (28/08) : tableau de bord réservé à Olivier — KPI
// plateforme (formateurs, clients, formations, CA estimé) + flux d'alertes bug.
// Voir supabase/functions/superadmin-kpis et superadmin-bugs pour le détail des
// calculs et leurs limites (notamment le CA, estimé faute d'intégration de
// facturation automatique à ce jour).
const ADMIN_EMAIL = "olivier@exsenco.fr";

type Periode = "mois" | "trimestre" | "semestre" | "annee";

const LABEL_PERIODE: Record<Periode, string> = {
  mois: "Ce mois-ci",
  trimestre: "Ce trimestre",
  semestre: "Ce semestre",
  annee: "Cette année",
};

interface Kpis {
  nb_formateurs: number;
  nb_clients: number;
  clients_par_formateur: number;
  nb_formations_disponibles: number;
  nb_formations_produites_periode: number;
  nb_formations_produites_periode_precedente: number;
  croissance_pct: number;
  ca_abonnements_centimes: number;
  ca_formations_centimes: number;
  ca_total_centimes: number;
  nb_sessions_avec_prix_renseigne: number;
  nb_sessions_sans_prix: number;
  nb_abonnements_actifs: number;
  nb_bugs_nouveaux: number;
}

interface Bug {
  id: string;
  source: "auto" | "manuel";
  type: string;
  message: string;
  stack: string | null;
  page_url: string | null;
  user_email: string | null;
  role: string | null;
  statut: string;
  created_at: string;
}

const formatEuros = (centimes: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centimes / 100);

const SuperAdmin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [periode, setPeriode] = useState<Periode>("mois");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [bugDetail, setBugDetail] = useState<Bug | null>(null);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  const chargerKpis = useCallback(async (p: Periode) => {
    const { data, error } = await supabase.functions.invoke("superadmin-kpis", { body: { periode: p } });
    if (error || data?.error) {
      toast({ title: "Erreur KPI", description: data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur."), variant: "destructive" });
      return;
    }
    setKpis(data);
  }, [toast]);

  const chargerBugs = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("superadmin-bugs", { body: { action: "lister" } });
    if (error || data?.error) {
      toast({ title: "Erreur bugs", description: data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur."), variant: "destructive" });
      return;
    }
    setBugs(data?.bugs || []);
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.email?.toLowerCase() !== ADMIN_EMAIL) { navigate("/dashboard"); return; }
    setUser({
      name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
      email: authSession.user.email || "",
      profileImage: "",
    });
    (async () => {
      await Promise.all([chargerKpis("mois"), chargerBugs()]);
      setLoading(false);
    })();
  }, [authSession, authLoading, navigate, chargerKpis, chargerBugs]);

  const changerPeriode = async (p: Periode) => {
    setPeriode(p);
    setKpis(null);
    await chargerKpis(p);
  };

  const marquerResolu = async (bug: Bug) => {
    setActionEnCours(bug.id);
    const { error, data } = await supabase.functions.invoke("superadmin-bugs", { body: { action: "resoudre", bug_id: bug.id, statut: "resolu" } });
    setActionEnCours(null);
    if (error || data?.error) {
      toast({ title: "Erreur", description: data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur."), variant: "destructive" });
      return;
    }
    toast({ title: "✅ Bug marqué résolu" });
    setBugDetail(null);
    chargerBugs();
    chargerKpis(periode);
  };

  if (authLoading || loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center text-gray-400">Chargement...</main>
        <Footer />
      </div>
    );
  }

  const bugsNouveaux = bugs.filter(b => b.statut !== "resolu");

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: "#25245e" }}>🛠️ Superadmin — Vue plateforme</h1>
            <Link to="/superadmin/explorer">
              <Button variant="outline" size="sm">🔎 Explorateur SAV (organismes, sessions, docs)</Button>
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Réservé à Olivier. Le CA ci-dessous est une <strong>estimation</strong> (pas d'intégration de facturation
            automatique à ce jour) : abonnements = saisis à la main dans l'explorateur, formations = uniquement les
            sessions dont la formation a un prix renseigné.
          </p>

          <div className="flex gap-2 mb-4">
            {(Object.keys(LABEL_PERIODE) as Periode[]).map(p => (
              <Button key={p} size="sm" variant={periode === p ? "default" : "outline"} style={periode === p ? { background: "#25245e", color: "#fff" } : {}} onClick={() => changerPeriode(p)}>
                {LABEL_PERIODE[p]}
              </Button>
            ))}
          </div>

          {!kpis ? (
            <div className="py-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">Formateurs inscrits</p>
                  <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{kpis.nb_formateurs}</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">Clients (tous formateurs)</p>
                  <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{kpis.nb_clients}</p>
                  <p className="text-xs text-gray-400 mt-1">≈ {kpis.clients_par_formateur} / formateur</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">Formations disponibles</p>
                  <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{kpis.nb_formations_disponibles}</p>
                  <p className="text-xs text-gray-400 mt-1">catalogue publié</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">Sessions démarrées — {LABEL_PERIODE[periode].toLowerCase()}</p>
                  <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{kpis.nb_formations_produites_periode}</p>
                  <p className={`text-xs mt-1 ${kpis.croissance_pct >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {kpis.croissance_pct >= 0 ? "↑" : "↓"} {Math.abs(kpis.croissance_pct)}% vs période précédente
                  </p>
                </CardContent></Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="md:col-span-2"><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">CA estimé — {LABEL_PERIODE[periode].toLowerCase()}</p>
                  <p className="text-3xl font-bold" style={{ color: "#f2901e" }}>{formatEuros(kpis.ca_total_centimes)}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>Abonnements ({kpis.nb_abonnements_actifs} actifs) : {formatEuros(kpis.ca_abonnements_centimes)}</span>
                    <span>Formations : {formatEuros(kpis.ca_formations_centimes)}</span>
                  </div>
                  {kpis.nb_sessions_sans_prix > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      ⚠️ {kpis.nb_sessions_sans_prix} session(s) de la période sans prix renseigné sur leur formation — non comptées dans le CA formations.
                    </p>
                  )}
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs text-gray-400 mb-1">Alertes bug nouvelles</p>
                  <p className="text-2xl font-bold" style={{ color: kpis.nb_bugs_nouveaux > 0 ? "#dc2626" : "#25245e" }}>{kpis.nb_bugs_nouveaux}</p>
                </CardContent></Card>
              </div>
            </>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" style={{ color: "#25245e" }}>
                🚨 Alertes bug {bugsNouveaux.length > 0 && <Badge variant="destructive" className="ml-2">{bugsNouveaux.length} en attente</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bugs.length === 0 && <p className="text-sm text-gray-400">Aucun bug remonté pour l'instant. 🎉</p>}
              <div className="space-y-2">
                {bugs.map(bug => (
                  <div key={bug.id} className={`flex items-start justify-between gap-3 p-3 rounded-lg ${bug.statut === "resolu" ? "bg-gray-50 opacity-60" : "bg-red-50"}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant={bug.source === "auto" ? "secondary" : "outline"}>{bug.source === "auto" ? "🤖 Auto" : "🙋 Signalé"}</Badge>
                        <Badge variant="outline">{bug.type}</Badge>
                        {bug.statut === "resolu" && <Badge variant="secondary">Résolu</Badge>}
                        <span className="text-xs text-gray-400">{new Date(bug.created_at).toLocaleString("fr-FR")}</span>
                      </div>
                      <p className="text-sm text-gray-700 truncate max-w-xl">{bug.message}</p>
                      <div className="flex gap-3 mt-1 text-xs">
                        {bug.user_email && <span className="text-gray-400">{bug.user_email} ({bug.role || "?"})</span>}
                        {bug.page_url && (
                          <a href={bug.page_url} target="_blank" rel="noreferrer" className="text-exsenco-blue hover:underline">Voir la page →</a>
                        )}
                        <button className="text-exsenco-blue hover:underline" onClick={() => setBugDetail(bug)}>Détails</button>
                      </div>
                    </div>
                    {bug.statut !== "resolu" && (
                      <Button size="sm" variant="outline" disabled={actionEnCours === bug.id} onClick={() => marquerResolu(bug)} className="shrink-0">
                        {actionEnCours === bug.id ? "..." : "Marquer résolu"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />

      <Dialog open={!!bugDetail} onOpenChange={(open) => !open && setBugDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ color: "#25245e" }}>{bugDetail?.type}</DialogTitle>
          </DialogHeader>
          {bugDetail && (
            <div className="space-y-2 text-sm">
              <p><strong>Message :</strong> {bugDetail.message}</p>
              {bugDetail.page_url && <p><strong>Page :</strong> <a href={bugDetail.page_url} target="_blank" rel="noreferrer" className="text-exsenco-blue hover:underline">{bugDetail.page_url}</a></p>}
              {bugDetail.user_email && <p><strong>Utilisateur :</strong> {bugDetail.user_email} ({bugDetail.role})</p>}
              <p><strong>Date :</strong> {new Date(bugDetail.created_at).toLocaleString("fr-FR")}</p>
              {bugDetail.stack && (
                <pre className="bg-gray-50 p-3 rounded text-xs overflow-x-auto max-h-64 whitespace-pre-wrap">{bugDetail.stack}</pre>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdmin;
