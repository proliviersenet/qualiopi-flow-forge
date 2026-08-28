import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { extractFunctionErrorMessage } from "@/lib/functionsError";
import { Loader2 } from "lucide-react";

// Chantier "superadmin" (28/08) : explorateur transverse pour intervention SAV
// (chercher un organisme → voir ses clients/formations/sessions → régénérer ou
// renvoyer un document précis). Toute la lecture passe par l'Edge Function
// superadmin-explorer (service role, gated ADMIN_EMAIL) ; la régénération de
// document réutilise directement les fonctions generer-* existantes (aucun
// contrôle de propriétaire dedans, déjà vérifié pendant le chantier
// sous-traitance) et la relance réutilise envoyer-relance.
const ADMIN_EMAIL = "olivier@exsenco.fr";

const DOCS_SESSION = [
  { type: "livret", label: "📘 Livret d'accueil", fn: "generer-livret" },
  { type: "emargement", label: "✍️ Émargement", fn: "generer-emargement" },
  { type: "devis", label: "💶 Devis", fn: "generer-devis" },
  { type: "convention", label: "📄 Convention", fn: "generer-convention" },
] as const;

const MOTIFS_RELANCE = [
  { value: "livret", label: "Livret d'accueil" },
  { value: "questionnaire_avant", label: "Questionnaire avant formation" },
  { value: "emargement", label: "Émargement" },
  { value: "questionnaire_apres", label: "Questionnaire après formation" },
  { value: "evaluation_chaud", label: "Évaluation à chaud" },
  { value: "evaluation_formateur", label: "Évaluation du formateur" },
  { value: "evaluation_froid", label: "Évaluation à froid" },
  { value: "attestation", label: "Attestation de fin de formation" },
];

interface OrganismeResult { id: string; raison_sociale: string; nda: string | null; siret: string | null; email_contact: string | null; nb_clients: number; nb_formations: number; }
interface Client { id: string; raison_sociale: string; contact_email: string | null; siret: string | null; }
interface Formation { id: string; titre: string; statut: string; tarif: string | null; montant_ht: number | null; }
interface SessionRow { id: string; formation_id: string; client_id: string; date_debut: string | null; date_fin: string | null; lieu: string | null; statut: string; formations: { titre: string } | null; clients: { raison_sociale: string } | null; }
interface Abonnement { id: string; montant_centimes: number; periodicite: string; statut: string; date_debut: string; notes: string | null; }
interface DocSession { id: string; type: string; genere: boolean; }
interface Stagiaire { id: string; nom: string; prenom: string; email: string | null; telephone: string | null; }

function msg(error: unknown, data: { error?: string } | null) {
  return data?.error || (error as Error)?.message || "Une erreur est survenue.";
}

const SuperAdminExplorer = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [resultats, setResultats] = useState<OrganismeResult[] | null>(null);

  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [organisme, setOrganisme] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [abonnement, setAbonnement] = useState<Abonnement | null>(null);
  const [aboForm, setAboForm] = useState({ montant: "", periodicite: "mensuel", statut: "actif" });
  const [savingAbo, setSavingAbo] = useState(false);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<{ formations: { titre: string } | null; clients: { raison_sociale: string; contact_email: string | null } | null; date_debut: string | null } | null>(null);
  const [docs, setDocs] = useState<DocSession[]>([]);
  const [stagiaires, setStagiaires] = useState<Stagiaire[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [actionDoc, setActionDoc] = useState<string | null>(null);
  const [motifParStagiaire, setMotifParStagiaire] = useState<Record<string, string>>({});

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.email?.toLowerCase() !== ADMIN_EMAIL) { navigate("/dashboard"); return; }
    setUser({
      name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
      email: authSession.user.email || "",
      profileImage: "",
    });
    setReady(true);
  }, [authSession, authLoading, navigate]);

  const rechercher = async () => {
    if (query.trim().length < 2) { toast({ title: "Saisissez au moins 2 caractères", variant: "destructive" }); return; }
    setSearching(true);
    setResultats(null);
    const { data, error } = await supabase.functions.invoke("superadmin-explorer", { body: { action: "rechercher", query: query.trim() } });
    setSearching(false);
    if (error || data?.error) { toast({ title: "Erreur", description: msg(error, data), variant: "destructive" }); return; }
    setResultats(data?.organismes || []);
  };

  const ouvrirOrganisme = async (id: string) => {
    setOrganismeId(id);
    setSessionId(null);
    setLoadingOrg(true);
    const { data, error } = await supabase.functions.invoke("superadmin-explorer", { body: { action: "organisme", organisme_id: id } });
    setLoadingOrg(false);
    if (error || data?.error) { toast({ title: "Erreur", description: msg(error, data), variant: "destructive" }); return; }
    setOrganisme(data.organisme);
    setClients(data.clients || []);
    setFormations(data.formations || []);
    setSessions(data.sessions || []);
    setAbonnement(data.abonnement || null);
    setAboForm(data.abonnement
      ? { montant: (data.abonnement.montant_centimes / 100).toString(), periodicite: data.abonnement.periodicite, statut: data.abonnement.statut }
      : { montant: "", periodicite: "mensuel", statut: "actif" });
  };

  const enregistrerAbonnement = async () => {
    if (!organismeId) return;
    const montantCentimes = Math.round(parseFloat(aboForm.montant.replace(",", ".")) * 100);
    if (!Number.isFinite(montantCentimes) || montantCentimes < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
    setSavingAbo(true);
    const { data, error } = await supabase.functions.invoke("superadmin-gerer-abonnement", {
      body: { organisme_id: organismeId, montant_centimes: montantCentimes, periodicite: aboForm.periodicite, statut: aboForm.statut, abonnement_id: abonnement?.id },
    });
    setSavingAbo(false);
    if (error || data?.error) { toast({ title: "Erreur", description: msg(error, data), variant: "destructive" }); return; }
    setAbonnement(data.abonnement);
    toast({ title: "✅ Abonnement enregistré" });
  };

  const ouvrirSession = async (id: string) => {
    setSessionId(id);
    setLoadingSession(true);
    const { data, error } = await supabase.functions.invoke("superadmin-explorer", { body: { action: "session", session_id: id } });
    setLoadingSession(false);
    if (error || data?.error) { toast({ title: "Erreur", description: msg(error, data), variant: "destructive" }); return; }
    setSessionDetail(data.session);
    setDocs(data.documents || []);
    setStagiaires(data.stagiaires || []);
  };

  const regenererDoc = async (fn: string, type: string) => {
    if (!sessionId) return;
    setActionDoc(type);
    const { data, error } = await supabase.functions.invoke(fn, { body: { session_id: sessionId } });
    setActionDoc(null);
    if (error || data?.error) { toast({ title: "Erreur génération", description: msg(error, data), variant: "destructive" }); return; }
    toast({ title: "✅ Document régénéré" });
    ouvrirSession(sessionId);
  };

  const regenererAttestation = async (stagiaireId: string) => {
    setActionDoc(`attestation-${stagiaireId}`);
    const { data, error } = await supabase.functions.invoke("generer-attestation", { body: { stagiaire_id: stagiaireId } });
    setActionDoc(null);
    if (error || data?.error) { toast({ title: "Erreur génération", description: msg(error, data), variant: "destructive" }); return; }
    toast({ title: "✅ Attestation régénérée" });
  };

  const relancerStagiaire = async (s: Stagiaire) => {
    const motif = motifParStagiaire[s.id] || "livret";
    setActionDoc(`relance-${s.id}`);
    const { data, error } = await supabase.functions.invoke("envoyer-relance", {
      body: {
        prenom: s.prenom, nom: s.nom, email: s.email, telephone: s.telephone,
        formation_titre: sessionDetail?.formations?.titre || "", motif, canal: "les_deux",
      },
    });
    setActionDoc(null);
    if (error || data?.error) { toast({ title: "Erreur relance", description: msg(error, data), variant: "destructive" }); return; }
    toast({ title: "✅ Relance envoyée" });
  };

  if (!ready) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center text-gray-400">Chargement...</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: "#25245e" }}>🔎 Explorateur SAV</h1>
            <Link to="/superadmin"><Button variant="outline" size="sm">← Tableau de bord</Button></Link>
          </div>
          <p className="text-sm text-gray-500 mb-6">Cherche un organisme (nom, NDA, SIRET) pour intervenir sur ses sessions à sa place.</p>

          <Card className="mb-6">
            <CardContent className="pt-5">
              <div className="flex gap-2">
                <Input placeholder="Nom, raison sociale, NDA, SIRET..." value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && rechercher()} />
                <Button onClick={rechercher} disabled={searching} style={{ background: "#25245e", color: "#fff" }}>{searching ? "..." : "Chercher"}</Button>
              </div>
              {resultats !== null && resultats.length === 0 && <p className="text-sm text-gray-400 mt-3">Aucun organisme trouvé.</p>}
              {resultats && resultats.length > 0 && (
                <div className="space-y-2 mt-3">
                  {resultats.map(o => (
                    <button key={o.id} onClick={() => ouvrirOrganisme(o.id)} className={`w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 border ${organismeId === o.id ? "border-exsenco-blue bg-gray-50" : "border-transparent"}`}>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{o.raison_sociale}</p>
                        <p className="text-xs text-gray-400">NDA {o.nda || "—"} · SIRET {o.siret || "—"} · {o.email_contact || "—"}</p>
                      </div>
                      <div className="text-xs text-gray-500">{o.nb_clients} client(s) · {o.nb_formations} formation(s)</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {loadingOrg && <div className="py-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}

          {organisme && !loadingOrg && (
            <>
              <Card className="mb-6">
                <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: "#25245e" }}>{String(organisme.raison_sociale)}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-gray-500">NDA {String(organisme.nda || "—")} · SIRET {String(organisme.siret || "—")} · {String(organisme.email_contact || "—")}</p>

                  <div className="border-t pt-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">💳 Abonnement QalioFlex</p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div>
                        <Label className="text-xs">Montant (€)</Label>
                        <Input className="w-28" value={aboForm.montant} onChange={e => setAboForm(f => ({ ...f, montant: e.target.value }))} placeholder="99" />
                      </div>
                      <div>
                        <Label className="text-xs">Périodicité</Label>
                        <Select value={aboForm.periodicite} onValueChange={v => setAboForm(f => ({ ...f, periodicite: v }))}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="mensuel">Mensuel</SelectItem><SelectItem value="annuel">Annuel</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Statut</Label>
                        <Select value={aboForm.statut} onValueChange={v => setAboForm(f => ({ ...f, statut: v }))}>
                          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="actif">Actif</SelectItem>
                            <SelectItem value="suspendu">Suspendu</SelectItem>
                            <SelectItem value="resilie">Résilié</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" disabled={savingAbo} onClick={enregistrerAbonnement} style={{ background: "#f2901e", color: "#fff" }}>
                        {savingAbo ? "..." : abonnement ? "Mettre à jour" : "Créer"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">👥 Clients ({clients.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-1 max-h-56 overflow-y-auto">
                    {clients.map(c => <p key={c.id} className="text-sm text-gray-600">{c.raison_sociale} <span className="text-xs text-gray-400">({c.contact_email || "—"})</span></p>)}
                    {clients.length === 0 && <p className="text-sm text-gray-400">Aucun client.</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">🎓 Formations ({formations.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-1 max-h-56 overflow-y-auto">
                    {formations.map(f => (
                      <p key={f.id} className="text-sm text-gray-600">
                        {f.titre} <Badge variant="outline" className="ml-1 text-xs">{f.statut}</Badge>
                        {f.montant_ht != null && <span className="text-xs text-gray-400"> · {f.montant_ht} € HT</span>}
                      </p>
                    ))}
                    {formations.length === 0 && <p className="text-sm text-gray-400">Aucune formation.</p>}
                  </CardContent>
                </Card>
              </div>

              <Card className="mb-6">
                <CardHeader className="pb-2"><CardTitle className="text-sm">📅 Sessions ({sessions.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1 max-h-72 overflow-y-auto">
                  {sessions.map(s => (
                    <button key={s.id} onClick={() => ouvrirSession(s.id)} className={`w-full text-left flex items-center justify-between p-2 rounded hover:bg-gray-50 ${sessionId === s.id ? "bg-gray-50" : ""}`}>
                      <span className="text-sm text-gray-700">{s.formations?.titre} — {s.clients?.raison_sociale}</span>
                      <span className="text-xs text-gray-400">{s.date_debut ? new Date(s.date_debut).toLocaleDateString("fr-FR") : "—"} · {s.statut}</span>
                    </button>
                  ))}
                  {sessions.length === 0 && <p className="text-sm text-gray-400">Aucune session.</p>}
                </CardContent>
              </Card>
            </>
          )}

          {loadingSession && <div className="py-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}

          {sessionDetail && !loadingSession && (
            <Card className="mb-6 border-exsenco-blue">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm" style={{ color: "#25245e" }}>
                  Session : {sessionDetail.formations?.titre} — {sessionDetail.clients?.raison_sociale}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Documents</p>
                  <div className="space-y-1">
                    {DOCS_SESSION.map(d => {
                      const existe = docs.find(x => x.type === d.type)?.genere;
                      return (
                        <div key={d.type} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm text-gray-700">{d.label} {existe ? <Badge variant="secondary" className="ml-1 text-xs">généré</Badge> : <Badge variant="outline" className="ml-1 text-xs">absent</Badge>}</span>
                          <Button size="sm" variant="outline" disabled={actionDoc === d.type} onClick={() => regenererDoc(d.fn, d.type)}>
                            {actionDoc === d.type ? "..." : existe ? "Régénérer" : "Générer"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Stagiaires ({stagiaires.length})</p>
                  <div className="space-y-1">
                    {stagiaires.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded flex-wrap">
                        <span className="text-sm text-gray-700">{s.prenom} {s.nom} <span className="text-xs text-gray-400">({s.email || s.telephone || "—"})</span></span>
                        <div className="flex gap-2 items-center">
                          <Select value={motifParStagiaire[s.id] || "livret"} onValueChange={v => setMotifParStagiaire(m => ({ ...m, [s.id]: v }))}>
                            <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{MOTIFS_RELANCE.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" disabled={actionDoc === `relance-${s.id}`} onClick={() => relancerStagiaire(s)}>
                            {actionDoc === `relance-${s.id}` ? "..." : "Relancer"}
                          </Button>
                          <Button size="sm" variant="outline" disabled={actionDoc === `attestation-${s.id}`} onClick={() => regenererAttestation(s.id)}>
                            {actionDoc === `attestation-${s.id}` ? "..." : "Régén. attestation"}
                          </Button>
                        </div>
                      </div>
                    ))}
                    {stagiaires.length === 0 && <p className="text-sm text-gray-400">Aucun stagiaire.</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SuperAdminExplorer;
