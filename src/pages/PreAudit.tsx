import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpPopup from "@/components/HelpPopup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Page "Pré-audit Qualiopi" — auto-diagnostic de conformité aux 32 indicateurs
// du référentiel national qualité, calculé à partir des vraies données de
// l'organisme (formations, sessions, stagiaires, documents). Contrairement à un
// vrai audit Certifopac, ce n'est pas une preuve de conformité opposable : les
// indicateurs sans source de donnée fiable dans QalioFlex (qualification des
// formateurs, réclamations, financement...) sont honnêtement marqués
// "à vérifier manuellement" plutôt que masqués ou faussement validés.
// Déclenche l'edge function lancer-preaudit, qui écrit aussi dans
// checklist_items (lu par l'onglet "Conformité Qualiopi" du Dashboard).

type Statut = "conforme" | "nc_majeure" | "nc_mineure" | "a_verifier" | "non_applicable";

interface ResultatIndicateur {
  indicateur: string;
  libelle: string;
  statut: Statut;
  nb_dossiers_conformes: number;
  nb_dossiers_nc_majeures: number;
  nb_dossiers_nc_mineures: number;
  nb_dossiers_analyses: number;
}

interface PreauditRow {
  id: string;
  lance_le: string;
  periode_debut: string;
  periode_fin: string;
  nb_dossiers_analyses: number;
  score_conformite: number | null;
  resultats: ResultatIndicateur[] | null;
}

const STATUT_INFO: Record<Statut, { label: string; badge: string }> = {
  conforme: { label: "Conforme", badge: "bg-green-100 text-green-700" },
  nc_majeure: { label: "Non-conformité majeure", badge: "bg-red-100 text-red-600" },
  nc_mineure: { label: "Non-conformité mineure", badge: "bg-orange-100 text-orange-700" },
  a_verifier: { label: "À vérifier manuellement", badge: "bg-gray-200 text-gray-600" },
  non_applicable: { label: "Non applicable", badge: "bg-gray-100 text-gray-400" },
};

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

const PreAudit = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session: authSession, loading: authLoading } = useAuth();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lancement, setLancement] = useState(false);
  const [historique, setHistorique] = useState<PreauditRow[]>([]);
  const [periodeDebut, setPeriodeDebut] = useState(isoDaysAgo(365));
  const [periodeFin, setPeriodeFin] = useState(isoDaysAgo(0));
  const [referentiel, setReferentiel] = useState<{ version: string; lien_pdf: string | null } | null>(null);

  const chargerHistorique = async (orgId: string) => {
    const { data } = await supabase
      .from("preaudits")
      .select("id, lance_le, periode_debut, periode_fin, nb_dossiers_analyses, score_conformite, resultats")
      .eq("organisme_id", orgId)
      .order("lance_le", { ascending: false })
      .limit(10);
    setHistorique((data ?? []) as unknown as PreauditRow[]);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });

      const { data: profile } = await supabase.from("profiles").select("organisme_id").eq("id", authSession.user.id).single();
      if (!profile?.organisme_id) { setLoading(false); return; }
      setOrganismeId(profile.organisme_id);

      const [{ data: veille }] = await Promise.all([
        supabase.from("veille_qualiopi_log").select("version_referentiel, lien_pdf").order("date_verification", { ascending: false }).limit(1),
        chargerHistorique(profile.organisme_id),
      ]);
      if (veille && veille[0]) setReferentiel({ version: veille[0].version_referentiel, lien_pdf: veille[0].lien_pdf });

      setLoading(false);
    };
    init();
  }, [authSession, authLoading, navigate]);

  const lancerPreaudit = async () => {
    if (!organismeId) return;
    setLancement(true);
    try {
      const { data, error } = await supabase.functions.invoke("lancer-preaudit", {
        body: { organisme_id: organismeId, periode_debut: periodeDebut, periode_fin: periodeFin },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Erreur lors du pré-audit");

      toast({ title: "Pré-audit terminé", description: `Score de conformité : ${data.score_conformite}%` });
      await chargerHistorique(organismeId);
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Le pré-audit a échoué", variant: "destructive" });
    } finally {
      setLancement(false);
    }
  };

  const dernier = historique[0] || null;
  const resultats = dernier?.resultats || [];
  const groupes: Record<Statut, ResultatIndicateur[]> = {
    nc_majeure: [], nc_mineure: [], a_verifier: [], conforme: [], non_applicable: [],
  };
  resultats.forEach(r => { (groupes[r.statut] ||= []).push(r); });

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
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <HelpPopup
        hintKey="preaudit_intro"
        title="Anticipe ton audit Qualiopi"
        items={[
          "Ce pré-audit vérifie automatiquement, sur les dossiers terminés de la période choisie, ce qui est réellement conforme au référentiel national qualité.",
          "Les indicateurs que l'application ne peut pas vérifier automatiquement (qualification des formateurs, réclamations, financement...) sont marqués « à vérifier manuellement » plutôt que faussement validés.",
          "Relance-le régulièrement : l'historique te permet de suivre ta progression avant le jour J.",
        ]}
      />

      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#25245e" }}>🧪 Pré-audit Qualiopi</h1>
          <p className="text-sm text-gray-500 mb-1">
            Auto-diagnostic de conformité aux 32 indicateurs du référentiel national qualité, calculé sur vos données réelles.
          </p>
          {referentiel && (
            <p className="text-xs text-gray-400 mb-6">
              Référentiel {referentiel.version}
              {referentiel.lien_pdf && (
                <> — <a href={referentiel.lien_pdf} target="_blank" rel="noreferrer" className="text-exsenco-blue hover:underline">voir le document officiel</a></>
              )} · <Link to="/qualiopi-statut" className="text-exsenco-blue hover:underline">statut de la veille réglementaire</Link>
            </p>
          )}

          <Card className="mb-6">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500">Période — dossiers clôturés à partir du</label>
                  <Input type="date" value={periodeDebut} onChange={e => setPeriodeDebut(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-gray-500">jusqu'au</label>
                  <Input type="date" value={periodeFin} onChange={e => setPeriodeFin(e.target.value)} />
                </div>
                <Button onClick={lancerPreaudit} disabled={lancement || !organismeId} style={{ background: "#f2901e", color: "#fff" }} className="font-bold whitespace-nowrap">
                  {lancement ? "Analyse en cours..." : "🔍 Lancer le pré-audit"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {!dernier ? (
            <Card><CardContent className="pt-6 text-center text-gray-500">
              Aucun pré-audit lancé pour le moment. Choisissez une période ci-dessus et lancez votre premier pré-audit.
            </CardContent></Card>
          ) : (
            <>
              <Card className="mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base" style={{ color: "#25245e" }}>Résultat du dernier pré-audit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-6 mb-2">
                    <div>
                      <div className="text-4xl font-bold" style={{ color: "#25245e" }}>{dernier.score_conformite ?? 0}%</div>
                      <div className="text-xs text-gray-400">score de conformité</div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge className={STATUT_INFO.nc_majeure.badge}>{groupes.nc_majeure.length} majeure{groupes.nc_majeure.length > 1 ? "s" : ""}</Badge>
                      <Badge className={STATUT_INFO.nc_mineure.badge}>{groupes.nc_mineure.length} mineure{groupes.nc_mineure.length > 1 ? "s" : ""}</Badge>
                      <Badge className={STATUT_INFO.a_verifier.badge}>{groupes.a_verifier.length} à vérifier</Badge>
                      <Badge className={STATUT_INFO.conforme.badge}>{groupes.conforme.length} conforme{groupes.conforme.length > 1 ? "s" : ""}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    {dernier.nb_dossiers_analyses} dossier{dernier.nb_dossiers_analyses > 1 ? "s" : ""} analysé{dernier.nb_dossiers_analyses > 1 ? "s" : ""} sur la période
                    du {new Date(dernier.periode_debut).toLocaleDateString("fr-FR")} au {new Date(dernier.periode_fin).toLocaleDateString("fr-FR")}
                    {" — "}le {new Date(dernier.lance_le).toLocaleDateString("fr-FR")}
                  </p>
                </CardContent>
              </Card>

              {(["nc_majeure", "nc_mineure", "a_verifier", "conforme", "non_applicable"] as Statut[]).map(statut => (
                groupes[statut].length > 0 && (
                  <Card key={statut} className="mb-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Badge className={STATUT_INFO[statut].badge}>{STATUT_INFO[statut].label}</Badge>
                        <span className="text-gray-400 font-normal">({groupes[statut].length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {groupes[statut].map(r => (
                          <div key={r.indicateur} className="flex items-center justify-between text-sm border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                            <span className="text-gray-700">{r.libelle}</span>
                            {r.nb_dossiers_analyses > 0 && (
                              <span className="text-xs text-gray-400 whitespace-nowrap ml-3">
                                {r.nb_dossiers_conformes}/{r.nb_dossiers_analyses} dossier{r.nb_dossiers_analyses > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              ))}

              <Card>
                <CardHeader><CardTitle className="text-base" style={{ color: "#25245e" }}>Historique des pré-audits</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {historique.map(h => (
                      <div key={h.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 text-sm">
                        <span className="text-gray-600">{new Date(h.lance_le).toLocaleDateString("fr-FR")}</span>
                        <span className="text-gray-400 text-xs">{h.nb_dossiers_analyses} dossier{h.nb_dossiers_analyses > 1 ? "s" : ""}</span>
                        <Badge className="bg-exsenco-blue/10 text-exsenco-blue">{h.score_conformite ?? 0}%</Badge>
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

export default PreAudit;
