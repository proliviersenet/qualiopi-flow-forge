import { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { extractFunctionErrorMessage } from "@/lib/functionsError";
import { Loader2 } from "lucide-react";

// Lot 6 du chantier facturation (12/11/2026) : pilotage des abonnements et du
// parrainage, réservé à Olivier. Données et actions : fonction
// superadmin-facturation (service-role, contrôle de l'email administrateur).
const ADMIN_EMAIL = "olivier@exsenco.fr";

type Abonne = {
  organisme_id: string; nom: string; email: string | null; statut: string; type_compte: string;
  fin_essai: string | null; resiliation_effective_le: string | null; coupure_prevue_le: string | null;
  ca_ht_centimes: number; sessions_facturees: number; mois_offerts_restants: number; badge: string | null; stripe: boolean;
  mois_manuels_annee: number;
};
type Parrain = {
  organisme_id: string; nom: string; code: string | null; confirmes: number; en_essai: number; cette_annee: number;
  badge: string | null; mois_gagnes: number; mois_restants: number; ca_filleuls_ht_centimes: number;
};
type Tableau = {
  parametres: { facturation_active: boolean; facturation_organismes_test: string[]; parrainage_regles: Record<string, number>; max_mois_manuels_par_an: number };
  tarifs: { code: string; libelle: string | null; montant_ht_centimes: number; synchronise_le: string | null }[];
  kpis_abonnements: {
    par_statut: Record<string, number>; payants: number; essais_en_cours: number; essais_finissant_7j: number;
    mrr_ht_centimes: number; ca_mois_ht_centimes: number; ca_12_mois_ht_centimes: number; ca_par_mois: Record<string, number>;
    sessions_facturees_mois: number; sessions_en_attente: number; impayes_ttc_centimes: number;
    taux_conversion_essai: number | null; resiliations_mois: number;
  };
  kpis_parrainage: {
    parrainages_total: number; parrainages_en_essai: number; parrainages_confirmes: number; parrains: number;
    membres_argent: number; membres_or: number; mois_offerts_accordes: number; mois_offerts_consommes: number;
    mois_offerts_a_venir: number; sessions_offertes: number; ca_filleuls_ht_centimes: number; cout_ht_centimes: number;
    engagement_ht_centimes: number; roi_pourcent: number | null;
  };
  abonnes: Abonne[];
  sans_abonnement: { organisme_id: string; nom: string; email: string | null }[];
  parrains: Parrain[];
};

const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

const LIBELLE_STATUT: Record<string, { texte: string; classe: string }> = {
  essai: { texte: "Essai", classe: "bg-blue-100 text-blue-800" },
  actif: { texte: "Actif", classe: "bg-green-100 text-green-800" },
  impaye: { texte: "Impayé", classe: "bg-red-100 text-red-800" },
  coupe: { texte: "Coupé", classe: "bg-red-200 text-red-900" },
  resiliation_programmee: { texte: "Résiliation programmée", classe: "bg-orange-100 text-orange-800" },
  resilie: { texte: "Résilié", classe: "bg-gray-100 text-gray-700" },
  suspendu: { texte: "Suspendu", classe: "bg-gray-100 text-gray-700" },
  exempte: { texte: "Exempté", classe: "bg-purple-100 text-purple-800" },
  ambassadeur: { texte: "Ambassadeur", classe: "bg-purple-100 text-purple-800" },
};

const badgeParrain = (b: string | null) =>
  b === "or" ? <span title="Membre Or">🥇 Or</span> : b === "argent" ? <span title="Membre Argent">🥈 Argent</span> : <span className="text-gray-400">—</span>;

const Kpi = ({ titre, valeur, detail, accent }: { titre: string; valeur: string | number; detail?: string; accent?: boolean }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-gray-500">{titre}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: accent ? "#f2901e" : "#25245e" }}>{valeur}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </CardContent>
  </Card>
);

const SuperAdminFacturation = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session: authSession, loading: authLoading } = useAuth();
  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [donnees, setDonnees] = useState<Tableau | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  const [regles, setRegles] = useState<Record<string, number>>({});
  const [prixSaisis, setPrixSaisis] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{ titre: string; texte: string; action: () => Promise<void> } | null>(null);

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  const charger = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("superadmin-facturation", { body: { action: "tableau" } });
    if (error || data?.error) {
      toast({ title: "Erreur de chargement", description: data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur."), variant: "destructive" });
      return;
    }
    setDonnees(data as Tableau);
    setRegles((data as Tableau).parametres.parrainage_regles);
    setPrixSaisis(Object.fromEntries((data as Tableau).tarifs.map((t) => [t.code, (t.montant_ht_centimes / 100).toFixed(2).replace(".", ",")])));
  }, [toast]);

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    if (authSession.user.email?.toLowerCase() !== ADMIN_EMAIL) { navigate("/dashboard"); return; }
    setUser({ name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "", email: authSession.user.email || "", profileImage: "" });
    charger().finally(() => setChargement(false));
  }, [authSession, authLoading, navigate, charger]);

  const agir = async (cle: string, corps: Record<string, unknown>, succes: string) => {
    setEnCours(cle);
    const { data, error } = await supabase.functions.invoke("superadmin-facturation", { body: corps });
    setEnCours(null);
    if (error || data?.error) {
      toast({ title: "Action impossible", description: data?.error || (error ? await extractFunctionErrorMessage(error) : "Erreur."), variant: "destructive" });
      return;
    }
    toast({ title: succes });
    await charger();
  };

  const confirmer = (titre: string, texte: string, action: () => Promise<void>) => setConfirmation({ titre, texte, action });

  if (chargement || !donnees) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
        <main className="flex-grow flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></main>
        <Footer />
      </div>
    );
  }

  const { parametres, kpis_abonnements: ka, kpis_parrainage: kp } = donnees;
  const recherche = filtre.trim().toLowerCase();
  const abonnesFiltres = donnees.abonnes.filter((a) => !recherche || a.nom.toLowerCase().includes(recherche) || (a.email ?? "").toLowerCase().includes(recherche));
  const sansAboFiltres = donnees.sans_abonnement.filter((a) => !recherche || a.nom.toLowerCase().includes(recherche) || (a.email ?? "").toLowerCase().includes(recherche));
  const mois12 = Object.entries(ka.ca_par_mois).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col min-h-screen">
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <main className="flex-grow bg-gray-50 py-6">
        <div className="container mx-auto px-4 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-2xl font-bold" style={{ color: "#25245e" }}>💳 Superadmin — Abonnements & parrainage</h1>
            <Link to="/superadmin"><Button variant="outline" size="sm">← Vue plateforme</Button></Link>
          </div>

          {/* Interrupteur général */}
          <Card className={parametres.facturation_active ? "border-green-300" : "border-orange-300"}>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-semibold" style={{ color: "#25245e" }}>
                  Facturation {parametres.facturation_active ? "ACTIVE pour tous les formateurs" : "désactivée (bêta gratuite)"}
                </p>
                <p className="text-sm text-gray-500">
                  {parametres.facturation_active
                    ? "Les nouveaux formateurs démarrent un essai de 7 jours avec carte. Les ambassadeurs restent exemptés."
                    : `Seuls les organismes de test (${parametres.facturation_organismes_test.length}) sont soumis à la facturation.`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">{parametres.facturation_active ? "Activée" : "Désactivée"}</span>
                <Switch checked={parametres.facturation_active} disabled={enCours !== null}
                  onCheckedChange={(v) => confirmer(
                    v ? "Activer la facturation pour tous ?" : "Désactiver la facturation ?",
                    v ? "Tous les formateurs non ambassadeurs devront démarrer leur essai (carte bancaire) pour accéder à leur espace. À faire au lancement commercial."
                      : "Plus aucun formateur ne sera invité à s'abonner. Les abonnements Stripe en cours continuent d'être prélevés.",
                    () => agir("interrupteur", { action: "parametre", cle: "facturation_active", valeur: v }, v ? "Facturation activée" : "Facturation désactivée"),
                  )} />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="abonnements">
            <TabsList>
              <TabsTrigger value="abonnements">Abonnements</TabsTrigger>
              <TabsTrigger value="parrainage">Parrainage</TabsTrigger>
              <TabsTrigger value="reglages">Tarifs et règles</TabsTrigger>
            </TabsList>

            {/* ───── Abonnements ───── */}
            <TabsContent value="abonnements" className="space-y-6 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi titre="Revenu mensuel récurrent (HT)" valeur={euros(ka.mrr_ht_centimes)} detail={`${ka.payants} abonné${ka.payants > 1 ? "s" : ""} payant${ka.payants > 1 ? "s" : ""}`} accent />
                <Kpi titre="Encaissé ce mois (HT)" valeur={euros(ka.ca_mois_ht_centimes)} detail={`12 mois : ${euros(ka.ca_12_mois_ht_centimes)}`} />
                <Kpi titre="Essais en cours" valeur={ka.essais_en_cours} detail={`${ka.essais_finissant_7j} se terminent sous 7 jours`} />
                <Kpi titre="Conversion essai → payant" valeur={ka.taux_conversion_essai === null ? "—" : `${ka.taux_conversion_essai} %`} />
                <Kpi titre="Sessions facturées ce mois" valeur={ka.sessions_facturees_mois} detail={`${ka.sessions_en_attente} en attente`} />
                <Kpi titre="Impayés en cours (TTC)" valeur={euros(ka.impayes_ttc_centimes)} />
                <Kpi titre="Résiliations ce mois" valeur={ka.resiliations_mois} />
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500 mb-2">Comptes par statut</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(ka.par_statut).map(([s, n]) => (
                        <Badge key={s} className={LIBELLE_STATUT[s]?.classe ?? ""}>{LIBELLE_STATUT[s]?.texte ?? s} : {n}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {mois12.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Encaissements HT des 12 derniers mois</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-2 h-32">
                      {mois12.map(([m, v]) => {
                        const max = Math.max(...mois12.map(([, x]) => x), 1);
                        return (
                          <div key={m} className="flex-1 flex flex-col items-center gap-1" title={`${m} : ${euros(v)}`}>
                            <div className="w-full rounded-t" style={{ height: `${Math.max(4, (v / max) * 100)}px`, background: "#25245e" }} />
                            <span className="text-[10px] text-gray-500">{m.slice(5)}/{m.slice(2, 4)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base">Organismes ({donnees.abonnes.length} avec abonnement, {donnees.sans_abonnement.length} sans)</CardTitle>
                  <Input className="max-w-xs" placeholder="Rechercher un organisme ou un email" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-3">Organisme</th><th className="pr-3">Statut</th><th className="pr-3">Échéance</th>
                        <th className="pr-3 text-right">CA HT</th><th className="pr-3 text-right">Sessions</th>
                        <th className="pr-3 text-right">Mois offerts</th><th className="pr-3">Badge</th><th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {abonnesFiltres.map((a) => {
                        const cle = a.type_compte === "super_ambassadeur" ? "ambassadeur" : a.statut;
                        const echeance = a.statut === "essai" ? `Fin d'essai ${dateFr(a.fin_essai)}`
                          : a.statut === "impaye" ? `Coupure ${dateFr(a.coupure_prevue_le)}`
                          : a.statut === "resiliation_programmee" ? `Fin ${dateFr(a.resiliation_effective_le)}` : "—";
                        return (
                          <tr key={a.organisme_id} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3"><p className="font-medium">{a.nom}</p><p className="text-xs text-gray-500">{a.email ?? ""}</p></td>
                            <td className="pr-3 py-2"><Badge className={LIBELLE_STATUT[cle]?.classe ?? ""}>{LIBELLE_STATUT[cle]?.texte ?? cle}</Badge></td>
                            <td className="pr-3 py-2 text-xs text-gray-600">{echeance}</td>
                            <td className="pr-3 py-2 text-right">{euros(a.ca_ht_centimes)}</td>
                            <td className="pr-3 py-2 text-right">{a.sessions_facturees}</td>
                            <td className="pr-3 py-2 text-right">{a.mois_offerts_restants}</td>
                            <td className="pr-3 py-2">{badgeParrain(a.badge)}</td>
                            <td className="py-2 text-right whitespace-nowrap space-x-1">
                              <Button size="sm" variant="ghost" disabled={enCours !== null || a.mois_manuels_annee >= parametres.max_mois_manuels_par_an}
                                title={`${a.mois_manuels_annee}/${parametres.max_mois_manuels_par_an} mois offerts manuellement cette année`}
                                onClick={() => confirmer(`Offrir un mois à ${a.nom} ?`, `Un mois d'abonnement sera déduit de sa prochaine facture complète. Mois offerts manuellement cette année : ${a.mois_manuels_annee}/${parametres.max_mois_manuels_par_an}.`,
                                  () => agir(`mois-${a.organisme_id}`, { action: "mois_offert", organisme_id: a.organisme_id, motif: "ajustement_manuel" }, "Mois offert accordé"))}>
                                🎁 Mois ({a.mois_manuels_annee}/{parametres.max_mois_manuels_par_an})
                              </Button>
                              {a.type_compte === "super_ambassadeur" ? (
                                <Button size="sm" variant="ghost" disabled={enCours !== null}
                                  onClick={() => confirmer(`Retirer le statut ambassadeur de ${a.nom} ?`, "Si la facturation est active, il devra démarrer un essai avec carte bancaire pour garder l'accès.",
                                    () => agir(`type-${a.organisme_id}`, { action: "type_compte", organisme_id: a.organisme_id, type: "standard" }, "Statut ambassadeur retiré"))}>
                                  Retirer ambassadeur
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" disabled={enCours !== null}
                                  onClick={() => confirmer(`Nommer ${a.nom} ambassadeur ?`, "L'organisme ne sera jamais facturé (abonnement et sessions).",
                                    () => agir(`type-${a.organisme_id}`, { action: "type_compte", organisme_id: a.organisme_id, type: "super_ambassadeur" }, "Ambassadeur nommé"))}>
                                  ⭐ Ambassadeur
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {sansAboFiltres.map((o) => (
                        <tr key={o.organisme_id} className="border-b last:border-0 align-top text-gray-600">
                          <td className="py-2 pr-3"><p className="font-medium">{o.nom}</p><p className="text-xs text-gray-500">{o.email ?? ""}</p></td>
                          <td className="pr-3 py-2"><Badge className="bg-gray-100 text-gray-600">{parametres.facturation_active ? "Pas encore abonné" : "Bêta gratuite"}</Badge></td>
                          <td colSpan={5} />
                          <td className="py-2 text-right">
                            <Button size="sm" variant="ghost" disabled={enCours !== null}
                              onClick={() => confirmer(`Nommer ${o.nom} ambassadeur ?`, "L'organisme ne sera jamais facturé (abonnement et sessions).",
                                () => agir(`type-${o.organisme_id}`, { action: "type_compte", organisme_id: o.organisme_id, type: "super_ambassadeur" }, "Ambassadeur nommé"))}>
                              ⭐ Ambassadeur
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ───── Parrainage ───── */}
            <TabsContent value="parrainage" className="space-y-6 mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi titre="Parrainages" valeur={kp.parrainages_total} detail={`${kp.parrainages_confirmes} confirmés · ${kp.parrainages_en_essai} en essai`} />
                <Kpi titre="Parrains actifs" valeur={kp.parrains} />
                <Kpi titre="Membres Argent / Or" valeur={`${kp.membres_argent} 🥈 · ${kp.membres_or} 🥇`} />
                <Kpi titre="ROI du parrainage" valeur={kp.roi_pourcent === null ? "—" : `${kp.roi_pourcent > 0 ? "+" : ""}${kp.roi_pourcent} %`}
                  detail="(CA filleuls − coût des offres) ÷ coût" accent />
                <Kpi titre="CA généré par les filleuls (HT)" valeur={euros(kp.ca_filleuls_ht_centimes)} />
                <Kpi titre="Coût des offres consommées (HT)" valeur={euros(kp.cout_ht_centimes)} detail={`${kp.mois_offerts_consommes} mois · ${kp.sessions_offertes} sessions offertes`} />
                <Kpi titre="Mois offerts" valeur={kp.mois_offerts_accordes} detail={`${kp.mois_offerts_consommes} consommés · ${kp.mois_offerts_a_venir} à venir`} />
                <Kpi titre="Engagement à venir (HT)" valeur={euros(kp.engagement_ht_centimes)} detail="mois de parrainage non encore consommés" />
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Parrains ({donnees.parrains.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  {donnees.parrains.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun parrainage pour l'instant.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-3">Parrain</th><th className="pr-3">Code</th><th className="pr-3 text-right">Confirmés</th>
                          <th className="pr-3 text-right">En essai</th><th className="pr-3 text-right">Cette année</th><th className="pr-3">Badge</th>
                          <th className="pr-3 text-right">Mois gagnés</th><th className="pr-3 text-right">Restants</th><th className="text-right">CA filleuls HT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {donnees.parrains.map((p) => (
                          <tr key={p.organisme_id} className="border-b last:border-0">
                            <td className="py-2 pr-3 font-medium">{p.nom}</td>
                            <td className="pr-3 font-mono text-xs">{p.code ?? "—"}</td>
                            <td className="pr-3 text-right">{p.confirmes}</td>
                            <td className="pr-3 text-right">{p.en_essai}</td>
                            <td className="pr-3 text-right">{p.cette_annee} / {parametres.parrainage_regles.max_filleuls_par_an ?? 5}</td>
                            <td className="pr-3">{badgeParrain(p.badge)}</td>
                            <td className="pr-3 text-right">{p.mois_gagnes}</td>
                            <td className="pr-3 text-right">{p.mois_restants}</td>
                            <td className="text-right">{euros(p.ca_filleuls_ht_centimes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ───── Réglages ───── */}
            <TabsContent value="reglages" className="space-y-6 mt-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Tarifs (HT)</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-500">Un changement crée un nouveau prix chez Stripe. Il s'applique aux nouveaux abonnés et aux sessions et exports à venir ; les abonnements déjà en cours gardent leur prix mensuel actuel.</p>
                  {donnees.tarifs.map((t) => (
                    <div key={t.code} className="flex flex-wrap items-center gap-3">
                      <span className="w-56 text-sm">{t.libelle ?? t.code}</span>
                      <Input className="w-32" value={prixSaisis[t.code] ?? ""} onChange={(e) => setPrixSaisis({ ...prixSaisis, [t.code]: e.target.value })} />
                      <span className="text-sm text-gray-500">€ HT</span>
                      <Button size="sm" variant="outline" disabled={enCours !== null}
                        onClick={() => {
                          const c = Math.round(parseFloat((prixSaisis[t.code] ?? "").replace(",", ".")) * 100);
                          if (!Number.isFinite(c) || c < 0) { toast({ title: "Montant invalide", variant: "destructive" }); return; }
                          if (c === t.montant_ht_centimes) return;
                          confirmer(`Passer « ${t.libelle ?? t.code} » à ${euros(c)} HT ?`, "Le nouveau prix est synchronisé avec Stripe immédiatement.",
                            () => agir(`tarif-${t.code}`, { action: "tarif", code: t.code, montant_ht_centimes: c }, "Tarif mis à jour"));
                        }}>Enregistrer</Button>
                      <span className="text-xs text-gray-400">Stripe : {t.synchronise_le ? dateFr(t.synchronise_le) : "non synchronisé"}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Règles du parrainage</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    ["max_filleuls_par_an", "Filleuls maximum par parrain et par an"],
                    ["seuil_argent", "Filleuls confirmés pour le badge Argent (+1 mois offert)"],
                    ["seuil_or", "Filleuls confirmés pour le badge Or (sessions offertes)"],
                    ["duree_sessions_offertes_mois", "Durée des sessions offertes du badge Or (mois)"],
                  ].map(([cle, libelle]) => (
                    <div key={cle} className="flex flex-wrap items-center gap-3">
                      <span className="w-96 text-sm">{libelle}</span>
                      <Input type="number" min={1} className="w-24" value={regles[cle] ?? ""}
                        onChange={(e) => setRegles({ ...regles, [cle]: parseInt(e.target.value, 10) })} />
                    </div>
                  ))}
                  <Button size="sm" disabled={enCours !== null}
                    onClick={() => agir("regles", { action: "parametre", cle: "parrainage_regles", valeur: regles }, "Règles enregistrées")}>
                    Enregistrer les règles
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />

      <AlertDialog open={!!confirmation} onOpenChange={(o) => !o && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.titre}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.texte}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const c = confirmation; setConfirmation(null); await c?.action(); }}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SuperAdminFacturation;
