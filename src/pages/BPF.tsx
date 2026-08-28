import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HelpPopup from "@/components/HelpPopup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────
// Chantier BPF v2 (juillet 2026) — refonte complète pour coller EXACTEMENT
// aux cadres A à H du Cerfa n°10443*17 (Bilan Pédagogique et Financier),
// vérifié champ par champ contre un BPF réellement télétransmis sur MAF
// (monactiviteformation.emploi.gouv.fr). L'ancienne version ne couvrait
// qu'un résumé simplifié (nb_stagiaires, nb_heures_formation, ca_formation,
// taux_satisfaction, nb_sessions, nb_formations, repartition_thematiques) —
// ces colonnes ont été supprimées (sauf nb_sessions/nb_formations, gardées
// comme suivi interne QalioFlex, hors périmètre officiel du BPF) et
// remplacées par la structure ci-dessous.
// ─────────────────────────────────────────────────────────────────────────

interface NbHeures {
  nb: number;
  heures: number;
}

const emptyNbHeures = (): NbHeures => ({ nb: 0, heures: 0 });

// Cadre C — Bilan financier HT : origine des produits (lignes 1 à 11, dont a à h)
interface CadreCData {
  entreprises: number; // ligne 1
  apprentissage: number; // a
  professionnalisation: number; // b
  promotion_reconversion: number; // c
  transition_pro: number; // d
  cpf: number; // e
  recherche_emploi: number; // f
  travailleurs_non_salaries: number; // g
  autres_dispositifs: number; // h
  pouvoirs_publics_agents: number; // 3
  instances_europeennes: number; // 4
  etat: number; // 5
  conseils_regionaux: number; // 6
  france_travail: number; // 7
  autres_ressources_publiques: number; // 8
  particuliers: number; // 9
  autres_organismes: number; // 10
  autres_produits: number; // 11
  part_ca_global_pct: number;
}

const emptyCadreC = (): CadreCData => ({
  entreprises: 0,
  apprentissage: 0,
  professionnalisation: 0,
  promotion_reconversion: 0,
  transition_pro: 0,
  cpf: 0,
  recherche_emploi: 0,
  travailleurs_non_salaries: 0,
  autres_dispositifs: 0,
  pouvoirs_publics_agents: 0,
  instances_europeennes: 0,
  etat: 0,
  conseils_regionaux: 0,
  france_travail: 0,
  autres_ressources_publiques: 0,
  particuliers: 0,
  autres_organismes: 0,
  autres_produits: 0,
  part_ca_global_pct: 0,
});

const cadreCLigne2 = (c: CadreCData) =>
  c.apprentissage + c.professionnalisation + c.promotion_reconversion + c.transition_pro +
  c.cpf + c.recherche_emploi + c.travailleurs_non_salaries + c.autres_dispositifs;

const cadreCTotalGeneral = (c: CadreCData) =>
  c.entreprises + cadreCLigne2(c) + c.pouvoirs_publics_agents + c.instances_europeennes +
  c.etat + c.conseils_regionaux + c.france_travail + c.autres_ressources_publiques +
  c.particuliers + c.autres_organismes + c.autres_produits;

// Cadre F-1 — Type de stagiaires de l'organisme
interface CadreF1Data {
  salaries_prives: NbHeures; // a
  apprentis: NbHeures; // b
  recherche_emploi: NbHeures; // c
  particuliers: NbHeures; // d
  autres: NbHeures; // e
}

const emptyCadreF1 = (): CadreF1Data => ({
  salaries_prives: emptyNbHeures(),
  apprentis: emptyNbHeures(),
  recherche_emploi: emptyNbHeures(),
  particuliers: emptyNbHeures(),
  autres: emptyNbHeures(),
});

const f1Total = (f: CadreF1Data): NbHeures => {
  const items = [f.salaries_prives, f.apprentis, f.recherche_emploi, f.particuliers, f.autres];
  return items.reduce((acc, v) => ({ nb: acc.nb + (v.nb || 0), heures: acc.heures + (v.heures || 0) }), emptyNbHeures());
};

// Cadre F-3 — Objectif général des prestations dispensées
interface CadreF3Data {
  diplome_rncp: NbHeures & {
    niveau_6_8: number; niveau_5: number; niveau_4: number; niveau_3: number; niveau_2: number; cqp_sans_niveau: number;
  }; // a
  certification_rs: NbHeures; // b
  cqp_non_enregistre: NbHeures; // c
  autres_formations: NbHeures; // d
  bilans_competences: NbHeures; // e
  vae: NbHeures; // f
}

const emptyCadreF3 = (): CadreF3Data => ({
  diplome_rncp: { ...emptyNbHeures(), niveau_6_8: 0, niveau_5: 0, niveau_4: 0, niveau_3: 0, niveau_2: 0, cqp_sans_niveau: 0 },
  certification_rs: emptyNbHeures(),
  cqp_non_enregistre: emptyNbHeures(),
  autres_formations: emptyNbHeures(),
  bilans_competences: emptyNbHeures(),
  vae: emptyNbHeures(),
});

const f3Total = (f: CadreF3Data): NbHeures => {
  const items = [f.diplome_rncp, f.certification_rs, f.cqp_non_enregistre, f.autres_formations, f.bilans_competences, f.vae];
  return items.reduce((acc, v) => ({ nb: acc.nb + (v.nb || 0), heures: acc.heures + (v.heures || 0) }), emptyNbHeures());
};

// Cadre F-4 — Spécialités de formation (5 principales + "autres")
interface SpecialiteF4 {
  libelle: string;
  code: string; // code NSF officiel, ex "312" pour Commerce, vente
  nb: number;
  heures: number;
}

interface CadreF4Data {
  specialites: SpecialiteF4[]; // jusqu'à 5 principales
  autres: NbHeures;
}

const emptyCadreF4 = (): CadreF4Data => ({ specialites: [], autres: emptyNbHeures() });

const f4Total = (f: CadreF4Data): NbHeures => {
  const base = f.specialites.reduce((acc, v) => ({ nb: acc.nb + (v.nb || 0), heures: acc.heures + (v.heures || 0) }), emptyNbHeures());
  return { nb: base.nb + (f.autres.nb || 0), heures: base.heures + (f.autres.heures || 0) };
};

interface BPFRecord {
  id: string;
  annee: number;
  nb_sessions: number | null;
  nb_formations: number | null;
  genere_le: string | null;
  valide: boolean;
  valide_le: string | null;
  created_at: string;
  // Cadre A
  adresse_publique: boolean | null;
  // Cadre B
  date_debut_exercice: string | null;
  date_fin_exercice: string | null;
  formation_a_distance: boolean | null;
  // Cadre C
  cadre_c: CadreCData | null;
  // Cadre D
  total_charges_formation: number | null;
  dont_salaires_formateurs: number | null;
  dont_achats_prestations: number | null;
  // Cadre E
  personnes_internes_nb: number | null;
  personnes_internes_heures: number | null;
  personnes_externes_nb: number | null;
  personnes_externes_heures: number | null;
  // Cadre F
  cadre_f1: CadreF1Data | null;
  confie_autre_organisme_nb: number | null;
  confie_autre_organisme_heures: number | null;
  cadre_f3: CadreF3Data | null;
  cadre_f4: CadreF4Data | null;
  // Cadre G
  g_nb_stagiaires: number | null;
  g_nb_heures: number | null;
  // Cadre H
  dirigeant_nom_prenom: string | null;
  dirigeant_qualite: string | null;
  lieu_signature: string | null;
}

interface OrganismeData {
  raison_sociale?: string;
  siret?: string;
  nda?: string;
  adresse?: string;
  code_naf?: string;
  telephone?: string;
  email_contact?: string;
  forme_juridique?: string;
  logo_url?: string;
}

const emptyForm = {
  annee: new Date().getFullYear(),
  nb_sessions: "",
  nb_formations: "",
  adresse_publique: true,
  date_debut_exercice: `${new Date().getFullYear()}-01-01`,
  date_fin_exercice: `${new Date().getFullYear()}-12-31`,
  formation_a_distance: false,
  total_charges_formation: "",
  dont_salaires_formateurs: "",
  dont_achats_prestations: "",
  personnes_internes_nb: "",
  personnes_internes_heures: "",
  personnes_externes_nb: "",
  personnes_externes_heures: "",
  confie_autre_organisme_nb: "",
  confie_autre_organisme_heures: "",
  g_nb_stagiaires: "",
  g_nb_heures: "",
  dirigeant_nom_prenom: "",
  dirigeant_qualite: "",
  lieu_signature: "",
};

const num = (v: string) => (v === "" ? 0 : Number(v));

const BPF = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();

  const [user, setUser] = useState<{ name: string; email: string; profileImage: string } | null>(null);
  const [organismeId, setOrganismeId] = useState<string | null>(null);
  const [organismeData, setOrganismeData] = useState<OrganismeData>({});
  const [bpfList, setBpfList] = useState<BPFRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [cadreC, setCadreC] = useState<CadreCData>(emptyCadreC());
  const [cadreF1, setCadreF1] = useState<CadreF1Data>(emptyCadreF1());
  const [cadreF3, setCadreF3] = useState<CadreF3Data>(emptyCadreF3());
  const [cadreF4, setCadreF4] = useState<CadreF4Data>(emptyCadreF4());

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const fetchBPF = async (orgId: string) => {
    const { data } = await supabase
      .from("bpf")
      .select("*")
      .eq("organisme_id", orgId)
      .order("annee", { ascending: false });
    setBpfList((data as BPFRecord[]) || []);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!authSession) { navigate("/login"); return; }
    // Point non bloquant (audit test grandeur réelle 01/08) : redirige un
    // compte client vers son espace au lieu de laisser voir l'UI formateur.
    if (authSession.user.user_metadata?.role === "client") { navigate("/espace-client"); return; }

    const init = async () => {
      setUser({
        name: authSession.user.user_metadata?.nom_complet || authSession.user.email || "",
        email: authSession.user.email || "",
        profileImage: "",
      });

      const { data: profile } = await supabase
        .from("profiles")
        .select("organisme_id")
        .eq("id", authSession.user.id)
        .single();

      if (profile?.organisme_id) {
        setOrganismeId(profile.organisme_id);
        await fetchBPF(profile.organisme_id);

        const { data: org } = await supabase
          .from("organismes")
          .select("raison_sociale, siret, nda, adresse, code_naf, telephone, email_contact, forme_juridique, logo_url")
          .eq("id", profile.organisme_id)
          .single();
        if (org) setOrganismeData(org as OrganismeData);
      }
      setLoading(false);
    };
    init();
  }, [navigate, authSession, authLoading]);

  const openCreate = async () => {
    setEditingId(null);
    const defaultForm = {
      ...emptyForm,
      dirigeant_nom_prenom: user?.name || "",
    };
    setForm(defaultForm);
    setCadreC(emptyCadreC());
    setCadreF1(emptyCadreF1());
    setCadreF3(emptyCadreF3());
    setCadreF4(emptyCadreF4());
    setDialogOpen(true);

    // Correctif audit du 31/07 : auto-alimentation réelle des deux seuls
    // cadres sans risque réglementaire (nb de sessions et de formations
    // distinctes réellement dispensées durant l'exercice, calculées depuis
    // les sessions de l'organisme) — ces deux champs sont explicitement
    // "suivi interne QalioFlex, hors périmètre officiel du BPF" (cf.
    // commentaire en tête de fichier). Les cadres officiels du Cerfa
    // (financiers, typologie des stagiaires...) restent volontairement
    // saisis à la main : les déduire automatiquement risquerait de produire
    // une déclaration DREETS inexacte, ce qu'aucune approximation ne
    // justifie sur un document réglementaire engageant l'organisme.
    if (organismeId) {
      const { data: sessionsExercice } = await supabase
        .from("sessions")
        .select("id, formation_id, formations:formation_id(organisme_id)")
        .gte("date_debut", defaultForm.date_debut_exercice)
        .lte("date_debut", defaultForm.date_fin_exercice);
      const sessionsOrg = ((sessionsExercice as { id: string; formation_id: string; formations: { organisme_id: string } | null }[]) || [])
        .filter((s) => s.formations?.organisme_id === organismeId);

      // Chantier "sous-traitance" (28/08) : les sessions confiées par un AUTRE
      // organisme, où je suis le formateur sous-traitant actif, comptent aussi dans
      // mon suivi interne — je les anime réellement, elles doivent apparaître dans
      // mon propre BPF/audit Qualiopi au même titre que mes propres sessions.
      const { data: sousTraitees } = await supabase
        .from("sessions_sous_traitance")
        .select("session_id, session:session_id(id, formation_id, date_debut)")
        .eq("organisme_sous_traitant_id", organismeId)
        .eq("statut", "actif");
      const sessionsSousTraitees = ((sousTraitees as { session_id: string; session: { id: string; formation_id: string; date_debut: string | null } | null }[]) || [])
        .map((s) => s.session)
        .filter((s): s is { id: string; formation_id: string; date_debut: string | null } =>
          !!s && !!s.date_debut && s.date_debut >= defaultForm.date_debut_exercice && s.date_debut <= defaultForm.date_fin_exercice
        );

      const toutesLesSessions = [...sessionsOrg, ...sessionsSousTraitees];
      if (toutesLesSessions.length > 0) {
        const formationIds = new Set(toutesLesSessions.map((s) => s.formation_id));
        setForm((prev) => ({
          ...prev,
          nb_sessions: String(toutesLesSessions.length),
          nb_formations: String(formationIds.size),
        }));
      }
    }
  };

  const openEdit = (bpf: BPFRecord) => {
    setEditingId(bpf.id);
    setForm({
      annee: bpf.annee,
      nb_sessions: bpf.nb_sessions?.toString() || "",
      nb_formations: bpf.nb_formations?.toString() || "",
      adresse_publique: bpf.adresse_publique ?? true,
      date_debut_exercice: bpf.date_debut_exercice || `${bpf.annee}-01-01`,
      date_fin_exercice: bpf.date_fin_exercice || `${bpf.annee}-12-31`,
      formation_a_distance: bpf.formation_a_distance ?? false,
      total_charges_formation: bpf.total_charges_formation?.toString() || "",
      dont_salaires_formateurs: bpf.dont_salaires_formateurs?.toString() || "",
      dont_achats_prestations: bpf.dont_achats_prestations?.toString() || "",
      personnes_internes_nb: bpf.personnes_internes_nb?.toString() || "",
      personnes_internes_heures: bpf.personnes_internes_heures?.toString() || "",
      personnes_externes_nb: bpf.personnes_externes_nb?.toString() || "",
      personnes_externes_heures: bpf.personnes_externes_heures?.toString() || "",
      confie_autre_organisme_nb: bpf.confie_autre_organisme_nb?.toString() || "",
      confie_autre_organisme_heures: bpf.confie_autre_organisme_heures?.toString() || "",
      g_nb_stagiaires: bpf.g_nb_stagiaires?.toString() || "",
      g_nb_heures: bpf.g_nb_heures?.toString() || "",
      dirigeant_nom_prenom: bpf.dirigeant_nom_prenom || "",
      dirigeant_qualite: bpf.dirigeant_qualite || "",
      lieu_signature: bpf.lieu_signature || "",
    });
    setCadreC({ ...emptyCadreC(), ...(bpf.cadre_c || {}) });
    setCadreF1({ ...emptyCadreF1(), ...(bpf.cadre_f1 || {}) });
    setCadreF3({ ...emptyCadreF3(), ...(bpf.cadre_f3 || {}) });
    setCadreF4({ ...emptyCadreF4(), ...(bpf.cadre_f4 || {}) });
    setDialogOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value }));
  };

  const setCadreCField = (key: keyof CadreCData, value: string) => {
    setCadreC((prev) => ({ ...prev, [key]: num(value) }));
  };

  const setF1Field = (cat: keyof CadreF1Data, field: keyof NbHeures, value: string) => {
    setCadreF1((prev) => ({ ...prev, [cat]: { ...prev[cat], [field]: num(value) } }));
  };

  const setF3Field = (cat: keyof CadreF3Data, field: string, value: string) => {
    setCadreF3((prev) => ({ ...prev, [cat]: { ...prev[cat], [field]: num(value) } }));
  };

  const addSpecialite = () => {
    setCadreF4((prev) => ({ ...prev, specialites: [...prev.specialites, { libelle: "", code: "", nb: 0, heures: 0 }] }));
  };
  const updateSpecialite = (i: number, field: keyof SpecialiteF4, value: string) => {
    setCadreF4((prev) => ({
      ...prev,
      specialites: prev.specialites.map((s, idx) => idx === i ? { ...s, [field]: field === "libelle" || field === "code" ? value : num(value) } : s),
    }));
  };
  const removeSpecialite = (i: number) => {
    setCadreF4((prev) => ({ ...prev, specialites: prev.specialites.filter((_, idx) => idx !== i) }));
  };

  const handleSave = async () => {
    if (!organismeId) {
      toast({
        title: "Profil incomplet",
        description: "Aucun organisme n'est rattaché à votre compte. Complétez votre profil d'abord.",
        variant: "destructive",
      });
      return;
    }
    if (!form.annee) {
      toast({ title: "Année obligatoire", description: "Veuillez saisir une année.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      organisme_id: organismeId,
      annee: Number(form.annee),
      nb_sessions: form.nb_sessions ? Number(form.nb_sessions) : null,
      nb_formations: form.nb_formations ? Number(form.nb_formations) : null,
      adresse_publique: form.adresse_publique,
      date_debut_exercice: form.date_debut_exercice || null,
      date_fin_exercice: form.date_fin_exercice || null,
      formation_a_distance: form.formation_a_distance,
      cadre_c: cadreC,
      total_charges_formation: form.total_charges_formation ? Number(form.total_charges_formation) : null,
      dont_salaires_formateurs: form.dont_salaires_formateurs ? Number(form.dont_salaires_formateurs) : null,
      dont_achats_prestations: form.dont_achats_prestations ? Number(form.dont_achats_prestations) : null,
      personnes_internes_nb: form.personnes_internes_nb ? Number(form.personnes_internes_nb) : null,
      personnes_internes_heures: form.personnes_internes_heures ? Number(form.personnes_internes_heures) : null,
      personnes_externes_nb: form.personnes_externes_nb ? Number(form.personnes_externes_nb) : null,
      personnes_externes_heures: form.personnes_externes_heures ? Number(form.personnes_externes_heures) : null,
      cadre_f1: cadreF1,
      confie_autre_organisme_nb: form.confie_autre_organisme_nb ? Number(form.confie_autre_organisme_nb) : null,
      confie_autre_organisme_heures: form.confie_autre_organisme_heures ? Number(form.confie_autre_organisme_heures) : null,
      cadre_f3: cadreF3,
      cadre_f4: cadreF4,
      g_nb_stagiaires: form.g_nb_stagiaires ? Number(form.g_nb_stagiaires) : null,
      g_nb_heures: form.g_nb_heures ? Number(form.g_nb_heures) : null,
      dirigeant_nom_prenom: form.dirigeant_nom_prenom || null,
      dirigeant_qualite: form.dirigeant_qualite || null,
      lieu_signature: form.lieu_signature || null,
      valide: false,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("bpf").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("bpf").insert(payload));
    }

    setSaving(false);

    if (error) {
      const msg = error.code === "23505"
        ? `Un BPF existe déjà pour ${form.annee}. Modifiez-le depuis la liste.`
        : error.message;
      toast({ title: "Erreur", description: msg, variant: "destructive" });
      return;
    }
    setDialogOpen(false);
    await fetchBPF(organismeId);
  };

  const handleValider = async (bpf: BPFRecord) => {
    const { error } = await supabase
      .from("bpf")
      .update({ valide: true, valide_le: new Date().toISOString(), genere_le: new Date().toISOString() })
      .eq("id", bpf.id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "BPF validé", description: `Le bilan ${bpf.annee} a été validé.` });
    if (organismeId) await fetchBPF(organismeId);
  };

  const handleSupprimer = async (bpf: BPFRecord) => {
    if (!confirm(`Supprimer le BPF ${bpf.annee} ? Cette action est irréversible.`)) return;
    const { error } = await supabase.from("bpf").delete().eq("id", bpf.id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "BPF supprimé" });
    if (organismeId) await fetchBPF(organismeId);
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
      <Header user={user || { name: "", email: "", profileImage: "" }} onLogout={handleLogout} />
      <HelpPopup
        hintKey="bpf_intro"
        title="Le module BPF, c'est quoi ?"
        items={[
          "Le Bilan Pédagogique et Financier (BPF) est ta déclaration annuelle obligatoire auprès de la DREETS.",
          "QalioFlex pré-remplit automatiquement le nombre de sessions et de formations dispensées sur l'exercice (suivi interne).",
          "Les cadres officiels du Cerfa (finances, typologie des stagiaires...) restent à saisir toi-même : eux seul garantissent l'exactitude de ta déclaration DREETS.",
          "Vérifie chaque cadre, complète ce qui manque, puis télétransmets-le sur monactiviteformation.emploi.gouv.fr.",
        ]}
      />

      <main className="flex-grow bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold">Bilan Pédagogique et Financier</h1>
              <p className="text-gray-500 text-sm mt-1">
                Déclaration annuelle obligatoire — DREETS · Cerfa n°10443*17, cadres A à H
              </p>
            </div>
            <Button
              onClick={openCreate}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
            >
              + Nouveau BPF
            </Button>
          </div>

          {bpfList.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-gray-400 text-lg mb-2">Aucun BPF enregistré</p>
                <p className="text-gray-400 text-sm mb-6">Créez votre premier Bilan Pédagogique et Financier pour l'année en cours.</p>
                <Button onClick={openCreate} style={{ background: "#f2901e", color: "#fff" }} className="font-bold">
                  Créer le BPF {new Date().getFullYear()}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {bpfList.map((bpf) => {
                const c = { ...emptyCadreC(), ...(bpf.cadre_c || {}) };
                const f1 = { ...emptyCadreF1(), ...(bpf.cadre_f1 || {}) };
                const totalProduits = cadreCTotalGeneral(c);
                const totalStagiairesF1 = f1Total(f1);
                return (
                  <Card key={bpf.id} className={bpf.valide ? "border-green-200" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl" style={{ color: "#25245e" }}>
                          BPF {bpf.annee}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {bpf.valide ? (
                            <Badge className="bg-green-100 text-green-700">
                              ✓ Validé {bpf.valide_le ? `le ${new Date(bpf.valide_le).toLocaleDateString("fr-FR")}` : ""}
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">En cours</Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold" style={{ color: "#25245e" }}>
                            {totalProduits > 0 ? `${totalProduits.toLocaleString("fr-FR")} €` : "—"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Total produits (cadre C)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold" style={{ color: "#25245e" }}>
                            {bpf.total_charges_formation != null ? `${Number(bpf.total_charges_formation).toLocaleString("fr-FR")} €` : "—"}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Total charges (cadre D)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{totalStagiairesF1.nb || "—"}</p>
                          <p className="text-xs text-gray-500 mt-1">Stagiaires (cadre F-1)</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold" style={{ color: "#25245e" }}>{totalStagiairesF1.heures || "—"}</p>
                          <p className="text-xs text-gray-500 mt-1">Heures (cadre F-1)</p>
                        </div>
                      </div>

                      <div className="flex gap-6 text-sm text-gray-500 mb-4 flex-wrap">
                        {bpf.g_nb_stagiaires ? <span>🔁 {bpf.g_nb_stagiaires} stagiaires confiés par un autre organisme (cadre G)</span> : null}
                        {bpf.nb_sessions != null && <span>📅 {bpf.nb_sessions} sessions (suivi interne)</span>}
                        {bpf.nb_formations != null && <span>📚 {bpf.nb_formations} formations (suivi interne)</span>}
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => imprimerBPF(bpf, organismeData)}>
                          📄 Télécharger PDF
                        </Button>
                        {!bpf.valide && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openEdit(bpf)}>
                              Modifier
                            </Button>
                            <Button
                              size="sm"
                              style={{ background: "#25245e", color: "#fff" }}
                              onClick={() => handleValider(bpf)}
                            >
                              Valider le BPF
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-500 hover:bg-red-50"
                          onClick={() => handleSupprimer(bpf)}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* ─── DIALOG CRÉATION / ÉDITION ─── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: "#25245e" }}>
              {editingId ? `Modifier le BPF ${form.annee}` : "Nouveau Bilan Pédagogique et Financier"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Année <span className="text-red-500">*</span></Label>
              <Input
                name="annee"
                type="number"
                value={form.annee}
                onChange={handleChange}
                min={2000}
                max={new Date().getFullYear()}
                disabled={!!editingId}
              />
            </div>

            <Accordion type="multiple" defaultValue={["A", "B", "C"]} className="w-full">

              {/* CADRE A */}
              <AccordionItem value="A">
                <AccordionTrigger className="text-sm font-semibold">Cadre A — Identification de l'organisme</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Repris automatiquement depuis votre profil organisme (SIRET {organismeData.siret || "—"},
                    NDA {organismeData.nda || "—"}, Code NAF {organismeData.code_naf || "—"},
                    forme juridique {organismeData.forme_juridique || "—"}, tél. {organismeData.telephone || "—"},
                    email {organismeData.email_contact || "—"}). Modifiable depuis Profil &gt; Organisme.
                  </p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="adresse_publique"
                      checked={form.adresse_publique}
                      onCheckedChange={(v) => setForm((prev) => ({ ...prev, adresse_publique: !!v }))}
                    />
                    <Label htmlFor="adresse_publique" className="font-normal">
                      Acceptez-vous que l'adresse de l'organisme soit rendue publique ?
                    </Label>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE B */}
              <AccordionItem value="B">
                <AccordionTrigger className="text-sm font-semibold">Cadre B — Informations générales</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Début de l'exercice comptable</Label>
                      <Input name="date_debut_exercice" type="date" value={form.date_debut_exercice} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                      <Label>Fin de l'exercice comptable</Label>
                      <Input name="date_fin_exercice" type="date" value={form.date_fin_exercice} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="formation_a_distance"
                      checked={form.formation_a_distance}
                      onCheckedChange={(v) => setForm((prev) => ({ ...prev, formation_a_distance: !!v }))}
                    />
                    <Label htmlFor="formation_a_distance" className="font-normal">
                      Avez-vous mis en œuvre, durant cette période, une (des) action(s) de formation en tout ou partie à distance ?
                    </Label>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE C */}
              <AccordionItem value="C">
                <AccordionTrigger className="text-sm font-semibold">Cadre C — Bilan financier HT : origine des produits</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">1 — Entreprises (formation de leurs salariés)</Label>
                    <Input type="number" value={cadreC.entreprises || ""} onChange={(e) => setCadreCField("entreprises", e.target.value)} placeholder="€" />
                  </div>
                  <p className="text-xs font-semibold text-gray-600 pt-1">Organismes gestionnaires des fonds de la formation (a à h)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">a — Contrats d'apprentissage</Label><Input type="number" value={cadreC.apprentissage || ""} onChange={(e) => setCadreCField("apprentissage", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">b — Contrats de professionnalisation</Label><Input type="number" value={cadreC.professionnalisation || ""} onChange={(e) => setCadreCField("professionnalisation", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">c — Promotion / reconversion par alternance</Label><Input type="number" value={cadreC.promotion_reconversion || ""} onChange={(e) => setCadreCField("promotion_reconversion", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">d — Projets de transition professionnelle</Label><Input type="number" value={cadreC.transition_pro || ""} onChange={(e) => setCadreCField("transition_pro", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">e — Compte personnel de formation (CPF)</Label><Input type="number" value={cadreC.cpf || ""} onChange={(e) => setCadreCField("cpf", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">f — Dispositifs personnes en recherche d'emploi</Label><Input type="number" value={cadreC.recherche_emploi || ""} onChange={(e) => setCadreCField("recherche_emploi", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">g — Dispositifs travailleurs non-salariés</Label><Input type="number" value={cadreC.travailleurs_non_salaries || ""} onChange={(e) => setCadreCField("travailleurs_non_salaries", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">h — Plan de développement des compétences / autres</Label><Input type="number" value={cadreC.autres_dispositifs || ""} onChange={(e) => setCadreCField("autres_dispositifs", e.target.value)} /></div>
                  </div>
                  <p className="text-xs text-gray-500">2 — Total organismes gestionnaires (a→h) : <strong>{cadreCLigne2(cadreC).toLocaleString("fr-FR")} €</strong> (calculé automatiquement)</p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1"><Label className="text-xs">3 — Pouvoirs publics (formation de leurs agents)</Label><Input type="number" value={cadreC.pouvoirs_publics_agents || ""} onChange={(e) => setCadreCField("pouvoirs_publics_agents", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">4 — Instances européennes</Label><Input type="number" value={cadreC.instances_europeennes || ""} onChange={(e) => setCadreCField("instances_europeennes", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">5 — État</Label><Input type="number" value={cadreC.etat || ""} onChange={(e) => setCadreCField("etat", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">6 — Conseils régionaux</Label><Input type="number" value={cadreC.conseils_regionaux || ""} onChange={(e) => setCadreCField("conseils_regionaux", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">7 — France Travail (ex Pôle emploi)</Label><Input type="number" value={cadreC.france_travail || ""} onChange={(e) => setCadreCField("france_travail", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">8 — Autres ressources publiques</Label><Input type="number" value={cadreC.autres_ressources_publiques || ""} onChange={(e) => setCadreCField("autres_ressources_publiques", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">9 — Particuliers (à titre individuel, à leurs frais)</Label><Input type="number" value={cadreC.particuliers || ""} onChange={(e) => setCadreCField("particuliers", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">10 — Contrats avec d'autres organismes de formation</Label><Input type="number" value={cadreC.autres_organismes || ""} onChange={(e) => setCadreCField("autres_organismes", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">11 — Autres produits au titre de la formation pro</Label><Input type="number" value={cadreC.autres_produits || ""} onChange={(e) => setCadreCField("autres_produits", e.target.value)} /></div>
                    <div className="space-y-1"><Label className="text-xs">Part du CA global réalisée en formation (%)</Label><Input type="number" min={0} max={100} value={cadreC.part_ca_global_pct || ""} onChange={(e) => setCadreCField("part_ca_global_pct", e.target.value)} /></div>
                  </div>
                  <p className="text-sm font-semibold pt-1" style={{ color: "#25245e" }}>
                    TOTAL des produits (lignes 1 à 11) : {cadreCTotalGeneral(cadreC).toLocaleString("fr-FR")} €
                  </p>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE D */}
              <AccordionItem value="D">
                <AccordionTrigger className="text-sm font-semibold">Cadre D — Bilan financier HT : charges de l'organisme</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Total des charges liées à l'activité de formation</Label><Input name="total_charges_formation" type="number" value={form.total_charges_formation} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">dont salaires des formateurs</Label><Input name="dont_salaires_formateurs" type="number" value={form.dont_salaires_formateurs} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">dont achats de prestations / honoraires de formation</Label><Input name="dont_achats_prestations" type="number" value={form.dont_achats_prestations} onChange={handleChange} /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE E */}
              <AccordionItem value="E">
                <AccordionTrigger className="text-sm font-semibold">Cadre E — Personnes dispensant des heures de formation</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Personnes de l'organisme — nombre</Label><Input name="personnes_internes_nb" type="number" value={form.personnes_internes_nb} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Personnes de l'organisme — heures dispensées</Label><Input name="personnes_internes_heures" type="number" value={form.personnes_internes_heures} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Sous-traitants externes — nombre</Label><Input name="personnes_externes_nb" type="number" value={form.personnes_externes_nb} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Sous-traitants externes — heures dispensées</Label><Input name="personnes_externes_heures" type="number" value={form.personnes_externes_heures} onChange={handleChange} /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE F */}
              <AccordionItem value="F">
                <AccordionTrigger className="text-sm font-semibold">Cadre F — Bilan pédagogique : stagiaires</AccordionTrigger>
                <AccordionContent className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">F-1 — Type de stagiaires de l'organisme</p>
                    <div className="space-y-2">
                      {([
                        ["salaries_prives", "a — Salariés d'employeurs privés (hors apprentis)"],
                        ["apprentis", "b — Apprentis"],
                        ["recherche_emploi", "c — Personnes en recherche d'emploi"],
                        ["particuliers", "d — Particuliers à leurs propres frais"],
                        ["autres", "e — Autres stagiaires"],
                      ] as [keyof CadreF1Data, string][]).map(([key, label]) => (
                        <div key={key} className="grid grid-cols-[1fr_100px_100px] gap-2 items-center">
                          <Label className="text-xs">{label}</Label>
                          <Input type="number" placeholder="Nb stagiaires" value={cadreF1[key].nb || ""} onChange={(e) => setF1Field(key, "nb", e.target.value)} />
                          <Input type="number" placeholder="Nb heures" value={cadreF1[key].heures || ""} onChange={(e) => setF1Field(key, "heures", e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">TOTAL (1) : {f1Total(cadreF1).nb} stagiaires — {f1Total(cadreF1).heures}h</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">F-2 — Dont activité sous-traitée par votre organisme (confiée à un autre OF)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label className="text-xs">Nombre de stagiaires</Label><Input name="confie_autre_organisme_nb" type="number" value={form.confie_autre_organisme_nb} onChange={handleChange} /></div>
                      <div className="space-y-1"><Label className="text-xs">Nombre d'heures</Label><Input name="confie_autre_organisme_heures" type="number" value={form.confie_autre_organisme_heures} onChange={handleChange} /></div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">F-3 — Objectif général des prestations dispensées</p>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_100px_100px] gap-2 items-center">
                        <Label className="text-xs">a — Diplôme / titre RNCP (nb / heures)</Label>
                        <Input type="number" value={cadreF3.diplome_rncp.nb || ""} onChange={(e) => setF3Field("diplome_rncp", "nb", e.target.value)} />
                        <Input type="number" value={cadreF3.diplome_rncp.heures || ""} onChange={(e) => setF3Field("diplome_rncp", "heures", e.target.value)} />
                      </div>
                      <div className="grid grid-cols-3 gap-2 pl-4">
                        <div className="space-y-1"><Label className="text-[10px]">dont niveau 6-8</Label><Input type="number" value={cadreF3.diplome_rncp.niveau_6_8 || ""} onChange={(e) => setF3Field("diplome_rncp", "niveau_6_8", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[10px]">dont niveau 5</Label><Input type="number" value={cadreF3.diplome_rncp.niveau_5 || ""} onChange={(e) => setF3Field("diplome_rncp", "niveau_5", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[10px]">dont niveau 4</Label><Input type="number" value={cadreF3.diplome_rncp.niveau_4 || ""} onChange={(e) => setF3Field("diplome_rncp", "niveau_4", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[10px]">dont niveau 3</Label><Input type="number" value={cadreF3.diplome_rncp.niveau_3 || ""} onChange={(e) => setF3Field("diplome_rncp", "niveau_3", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[10px]">dont niveau 2</Label><Input type="number" value={cadreF3.diplome_rncp.niveau_2 || ""} onChange={(e) => setF3Field("diplome_rncp", "niveau_2", e.target.value)} /></div>
                        <div className="space-y-1"><Label className="text-[10px]">dont CQP sans niveau</Label><Input type="number" value={cadreF3.diplome_rncp.cqp_sans_niveau || ""} onChange={(e) => setF3Field("diplome_rncp", "cqp_sans_niveau", e.target.value)} /></div>
                      </div>
                      {([
                        ["certification_rs", "b — Certification / habilitation au répertoire spécifique (RS)"],
                        ["cqp_non_enregistre", "c — CQP non enregistré au RNCP ou au RS"],
                        ["autres_formations", "d — Autres formations professionnelles"],
                        ["bilans_competences", "e — Bilans de compétences"],
                        ["vae", "f — Accompagnement à la VAE"],
                      ] as [keyof Omit<CadreF3Data, "diplome_rncp">, string][]).map(([key, label]) => (
                        <div key={key} className="grid grid-cols-[1fr_100px_100px] gap-2 items-center">
                          <Label className="text-xs">{label}</Label>
                          <Input type="number" value={cadreF3[key].nb || ""} onChange={(e) => setF3Field(key, "nb", e.target.value)} />
                          <Input type="number" value={cadreF3[key].heures || ""} onChange={(e) => setF3Field(key, "heures", e.target.value)} />
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">TOTAL (3) : {f3Total(cadreF3).nb} stagiaires — {f3Total(cadreF3).heures}h</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-600">F-4 — Spécialités de formation (5 principales, code NSF officiel)</p>
                      <Button type="button" size="sm" variant="outline" onClick={addSpecialite} disabled={cadreF4.specialites.length >= 5}>+ Ajouter</Button>
                    </div>
                    {cadreF4.specialites.length === 0 && <p className="text-xs text-gray-400 italic">Aucune spécialité renseignée.</p>}
                    <div className="space-y-2">
                      {cadreF4.specialites.map((s, i) => (
                        <div key={i} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                          <Input placeholder="Spécialité (ex: Commerce, vente)" value={s.libelle} onChange={(e) => updateSpecialite(i, "libelle", e.target.value)} className="flex-1" />
                          <Input placeholder="Code NSF" value={s.code} onChange={(e) => updateSpecialite(i, "code", e.target.value)} className="w-24" />
                          <Input type="number" placeholder="Stagiaires" value={s.nb || ""} onChange={(e) => updateSpecialite(i, "nb", e.target.value)} className="w-24" />
                          <Input type="number" placeholder="Heures" value={s.heures || ""} onChange={(e) => updateSpecialite(i, "heures", e.target.value)} className="w-24" />
                          <Button type="button" size="sm" variant="ghost" className="text-red-400 hover:text-red-600 px-2" onClick={() => removeSpecialite(i)}>✕</Button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-[1fr_100px_100px] gap-2 items-center mt-2">
                      <Label className="text-xs">Autres spécialités (regroupées)</Label>
                      <Input type="number" placeholder="Stagiaires" value={cadreF4.autres.nb || ""} onChange={(e) => setCadreF4((prev) => ({ ...prev, autres: { ...prev.autres, nb: num(e.target.value) } }))} />
                      <Input type="number" placeholder="Heures" value={cadreF4.autres.heures || ""} onChange={(e) => setCadreF4((prev) => ({ ...prev, autres: { ...prev.autres, heures: num(e.target.value) } }))} />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">TOTAL (4) : {f4Total(cadreF4).nb} stagiaires — {f4Total(cadreF4).heures}h</p>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE G */}
              <AccordionItem value="G">
                <AccordionTrigger className="text-sm font-semibold">Cadre G — Stagiaires confiés par un autre organisme (sous-traitance reçue)</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Nombre de stagiaires</Label><Input name="g_nb_stagiaires" type="number" value={form.g_nb_stagiaires} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Nombre d'heures</Label><Input name="g_nb_heures" type="number" value={form.g_nb_heures} onChange={handleChange} /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* CADRE H */}
              <AccordionItem value="H">
                <AccordionTrigger className="text-sm font-semibold">Cadre H — Personne ayant la qualité de dirigeant</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Nom et prénom</Label><Input name="dirigeant_nom_prenom" value={form.dirigeant_nom_prenom} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Qualité (ex: Gérant, Président)</Label><Input name="dirigeant_qualite" value={form.dirigeant_qualite} onChange={handleChange} /></div>
                    <div className="space-y-1"><Label className="text-xs">Lieu de signature</Label><Input name="lieu_signature" value={form.lieu_signature} onChange={handleChange} placeholder="ex: Saint-Avertin" /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* SUIVI INTERNE — hors Cerfa */}
              <AccordionItem value="interne">
                <AccordionTrigger className="text-sm font-semibold text-gray-500">Suivi interne QalioFlex (non transmis à la DREETS)</AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Nombre de sessions</Label><Input name="nb_sessions" type="number" value={form.nb_sessions} onChange={handleChange} placeholder="ex: 24" /></div>
                    <div className="space-y-2"><Label>Nombre de formations</Label><Input name="nb_formations" type="number" value={form.nb_formations} onChange={handleChange} placeholder="ex: 8" /></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ background: "#f2901e", color: "#fff" }}
              className="font-bold"
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer le BPF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ─── Utilitaire : génère la fenêtre d'impression PDF du BPF, cadre par cadre,
// avec les mêmes numéros de ligne que le Cerfa 10443*17, pour permettre une
// recopie directe champ par champ sur le portail MAF. ──────────────────────
export const imprimerBPF = (bpf: BPFRecord, organisme: OrganismeData) => {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;

  const dateDeclaration = new Date().toLocaleDateString("fr-FR");
  const c = { ...emptyCadreC(), ...(bpf.cadre_c || {}) };
  const f1 = { ...emptyCadreF1(), ...(bpf.cadre_f1 || {}) };
  const f3 = { ...emptyCadreF3(), ...(bpf.cadre_f3 || {}) };
  const f4 = { ...emptyCadreF4(), ...(bpf.cadre_f4 || {}) };
  const eur = (v: number | null | undefined) => v != null ? `${Number(v).toLocaleString("fr-FR")} €` : "—";
  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  win.document.write(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>BPF ${bpf.annee} — ${organisme.raison_sociale || "Organisme de formation"}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #1a1a2e; background: #fff; }
    .page { max-width: 820px; margin: 0 auto; padding: 32px; }
    .header { background: #25245e; color: #fff; padding: 20px 24px; border-radius: 4px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 17pt; font-weight: bold; letter-spacing: 1px; }
    .header .subtitle { font-size: 9pt; opacity: 0.8; margin-top: 4px; }
    .header .badge { background: #f2901e; color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 10pt; font-weight: bold; }
    .section { margin-bottom: 16px; border: 1px solid #e0e0e0; border-radius: 4px; overflow: hidden; }
    .section-title { background: #f5f5f8; border-bottom: 2px solid #25245e; padding: 8px 16px; font-weight: bold; font-size: 10pt; color: #25245e; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-body { padding: 12px 16px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
    .field { margin-bottom: 8px; }
    .field label { font-size: 8pt; color: #777; display: block; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px; }
    .field value { font-size: 10.5pt; font-weight: 600; display: block; }
    .kpi { background: #f5f5f8; border-radius: 4px; padding: 10px; text-align: center; }
    .kpi .number { font-size: 18pt; font-weight: bold; color: #25245e; }
    .kpi .label { font-size: 8pt; color: #777; margin-top: 4px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 8px; }
    th { background: #25245e; color: #fff; padding: 5px 8px; text-align: left; font-size: 8.5pt; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f9f9fb; }
    .total-line { text-align: right; font-weight: bold; font-size: 10pt; color: #25245e; margin-top: 4px; }
    .guide { background: #fff8f0; border: 1px solid #f2901e; border-radius: 4px; padding: 16px; margin-bottom: 20px; }
    .guide h3 { color: #f2901e; font-size: 11pt; margin-bottom: 10px; }
    .guide ol { padding-left: 18px; }
    .guide li { margin-bottom: 6px; font-size: 10pt; line-height: 1.5; }
    .guide .url { background: #fff; border: 1px solid #ddd; border-radius: 3px; padding: 4px 10px; font-family: monospace; font-size: 9pt; margin: 8px 0; display: inline-block; }
    .guide .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 3px; padding: 8px 12px; margin-top: 10px; font-size: 9pt; }
    .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee; font-size: 8pt; color: #aaa; }
    .footer strong { color: #25245e; }
    .stamp { border: 3px solid #16a34a; border-radius: 4px; padding: 8px 16px; display: inline-block; color: #16a34a; font-weight: bold; font-size: 10pt; margin-top: 10px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
      .page { padding: 16px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <div style="font-size:10pt;opacity:0.7;margin-bottom:4px;">QalioFlex — by ExSenCo</div>
      <h1>Bilan Pédagogique et Financier</h1>
      <div class="subtitle">Cerfa n°10443*17 — Déclaration DREETS / MAF</div>
    </div>
    <div class="badge">Exercice ${bpf.annee}</div>
  </div>

  <div class="section">
    <div class="section-title">Cadre A — Identification de l'organisme</div>
    <div class="section-body grid-2">
      <div>
        <div class="field"><label>Raison sociale / Nom</label><value>${organisme.raison_sociale || "—"}</value></div>
        <div class="field"><label>Forme juridique</label><value>${organisme.forme_juridique || "—"}</value></div>
        <div class="field"><label>NDA (N° Déclaration d'Activité)</label><value>${organisme.nda || "—"}</value></div>
      </div>
      <div>
        <div class="field"><label>SIRET</label><value>${organisme.siret || "—"}</value></div>
        <div class="field"><label>Code NAF</label><value>${organisme.code_naf || "—"}</value></div>
        <div class="field"><label>Adresse (publique : ${bpf.adresse_publique ? "oui" : "non"})</label><value>${organisme.adresse || "—"}</value></div>
        <div class="field"><label>Tél / Email</label><value>${organisme.telephone || "—"} / ${organisme.email_contact || "—"}</value></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre B — Période de référence</div>
    <div class="section-body grid-2">
      <div class="field"><label>Début de l'exercice</label><value>${fmtDate(bpf.date_debut_exercice)}</value></div>
      <div class="field"><label>Fin de l'exercice</label><value>${fmtDate(bpf.date_fin_exercice)}</value></div>
      <div class="field" style="grid-column: span 2;"><label>Formation(s) à distance sur la période</label><value>${bpf.formation_a_distance ? "Oui" : "Non"}</value></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre C — Bilan financier HT : origine des produits</div>
    <div class="section-body">
      <table>
        <tbody>
          <tr><td>1 — Entreprises (formation de leurs salariés)</td><td style="text-align:right;">${eur(c.entreprises)}</td></tr>
          <tr><td>a — Contrats d'apprentissage</td><td style="text-align:right;">${eur(c.apprentissage)}</td></tr>
          <tr><td>b — Contrats de professionnalisation</td><td style="text-align:right;">${eur(c.professionnalisation)}</td></tr>
          <tr><td>c — Promotion / reconversion par alternance</td><td style="text-align:right;">${eur(c.promotion_reconversion)}</td></tr>
          <tr><td>d — Projets de transition professionnelle</td><td style="text-align:right;">${eur(c.transition_pro)}</td></tr>
          <tr><td>e — Compte personnel de formation</td><td style="text-align:right;">${eur(c.cpf)}</td></tr>
          <tr><td>f — Dispositifs recherche d'emploi</td><td style="text-align:right;">${eur(c.recherche_emploi)}</td></tr>
          <tr><td>g — Dispositifs travailleurs non-salariés</td><td style="text-align:right;">${eur(c.travailleurs_non_salaries)}</td></tr>
          <tr><td>h — Plan de développement des compétences / autres</td><td style="text-align:right;">${eur(c.autres_dispositifs)}</td></tr>
          <tr><td><strong>2 — Total organismes gestionnaires (a→h)</strong></td><td style="text-align:right;"><strong>${eur(cadreCLigne2(c))}</strong></td></tr>
          <tr><td>3 — Pouvoirs publics (agents)</td><td style="text-align:right;">${eur(c.pouvoirs_publics_agents)}</td></tr>
          <tr><td>4 — Instances européennes</td><td style="text-align:right;">${eur(c.instances_europeennes)}</td></tr>
          <tr><td>5 — État</td><td style="text-align:right;">${eur(c.etat)}</td></tr>
          <tr><td>6 — Conseils régionaux</td><td style="text-align:right;">${eur(c.conseils_regionaux)}</td></tr>
          <tr><td>7 — France Travail</td><td style="text-align:right;">${eur(c.france_travail)}</td></tr>
          <tr><td>8 — Autres ressources publiques</td><td style="text-align:right;">${eur(c.autres_ressources_publiques)}</td></tr>
          <tr><td>9 — Particuliers à leurs frais</td><td style="text-align:right;">${eur(c.particuliers)}</td></tr>
          <tr><td>10 — Contrats avec d'autres organismes de formation</td><td style="text-align:right;">${eur(c.autres_organismes)}</td></tr>
          <tr><td>11 — Autres produits au titre de la formation pro</td><td style="text-align:right;">${eur(c.autres_produits)}</td></tr>
        </tbody>
      </table>
      <div class="total-line">TOTAL DES PRODUITS (1 à 11) : ${eur(cadreCTotalGeneral(c))}</div>
      <div class="total-line" style="color:#777;">Part du CA global réalisée en formation : ${c.part_ca_global_pct || 0} %</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre D — Bilan financier HT : charges de l'organisme</div>
    <div class="section-body grid-2">
      <div class="field"><label>Total des charges liées à la formation</label><value>${eur(bpf.total_charges_formation)}</value></div>
      <div class="field"><label>dont salaires des formateurs</label><value>${eur(bpf.dont_salaires_formateurs)}</value></div>
      <div class="field"><label>dont achats de prestations / honoraires</label><value>${eur(bpf.dont_achats_prestations)}</value></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre E — Personnes dispensant des heures de formation</div>
    <div class="section-body">
      <table>
        <thead><tr><th></th><th>Nombre</th><th>Heures dispensées</th></tr></thead>
        <tbody>
          <tr><td>Personnes de l'organisme</td><td>${bpf.personnes_internes_nb ?? "—"}</td><td>${bpf.personnes_internes_heures ?? "—"}</td></tr>
          <tr><td>Personnes extérieures (sous-traitance)</td><td>${bpf.personnes_externes_nb ?? "—"}</td><td>${bpf.personnes_externes_heures ?? "—"}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre F — Bilan pédagogique : stagiaires</div>
    <div class="section-body">
      <p style="font-size:9pt;font-weight:bold;color:#777;margin-bottom:4px;">F-1 — Type de stagiaires</p>
      <table>
        <thead><tr><th></th><th>Nb stagiaires</th><th>Nb heures</th></tr></thead>
        <tbody>
          <tr><td>a — Salariés d'employeurs privés</td><td>${f1.salaries_prives.nb}</td><td>${f1.salaries_prives.heures}</td></tr>
          <tr><td>b — Apprentis</td><td>${f1.apprentis.nb}</td><td>${f1.apprentis.heures}</td></tr>
          <tr><td>c — Personnes en recherche d'emploi</td><td>${f1.recherche_emploi.nb}</td><td>${f1.recherche_emploi.heures}</td></tr>
          <tr><td>d — Particuliers à leurs propres frais</td><td>${f1.particuliers.nb}</td><td>${f1.particuliers.heures}</td></tr>
          <tr><td>e — Autres stagiaires</td><td>${f1.autres.nb}</td><td>${f1.autres.heures}</td></tr>
          <tr><td><strong>TOTAL (1)</strong></td><td><strong>${f1Total(f1).nb}</strong></td><td><strong>${f1Total(f1).heures}</strong></td></tr>
        </tbody>
      </table>
      <p style="font-size:9pt;font-weight:bold;color:#777;margin:10px 0 4px;">F-2 — Dont activité sous-traitée par votre organisme</p>
      <table><tbody><tr><td>Confié à un autre organisme</td><td>${bpf.confie_autre_organisme_nb ?? "—"}</td><td>${bpf.confie_autre_organisme_heures ?? "—"}</td></tr></tbody></table>
      <p style="font-size:9pt;font-weight:bold;color:#777;margin:10px 0 4px;">F-3 — Objectif général des prestations</p>
      <table>
        <thead><tr><th></th><th>Nb stagiaires</th><th>Nb heures</th></tr></thead>
        <tbody>
          <tr><td>a — Diplôme / titre RNCP</td><td>${f3.diplome_rncp.nb}</td><td>${f3.diplome_rncp.heures}</td></tr>
          <tr><td>b — Certification RS</td><td>${f3.certification_rs.nb}</td><td>${f3.certification_rs.heures}</td></tr>
          <tr><td>c — CQP non enregistré</td><td>${f3.cqp_non_enregistre.nb}</td><td>${f3.cqp_non_enregistre.heures}</td></tr>
          <tr><td>d — Autres formations professionnelles</td><td>${f3.autres_formations.nb}</td><td>${f3.autres_formations.heures}</td></tr>
          <tr><td>e — Bilans de compétences</td><td>${f3.bilans_competences.nb}</td><td>${f3.bilans_competences.heures}</td></tr>
          <tr><td>f — Accompagnement VAE</td><td>${f3.vae.nb}</td><td>${f3.vae.heures}</td></tr>
          <tr><td><strong>TOTAL (3)</strong></td><td><strong>${f3Total(f3).nb}</strong></td><td><strong>${f3Total(f3).heures}</strong></td></tr>
        </tbody>
      </table>
      <p style="font-size:9pt;font-weight:bold;color:#777;margin:10px 0 4px;">F-4 — Spécialités de formation</p>
      <table>
        <thead><tr><th>Spécialité</th><th>Code</th><th>Nb stagiaires</th><th>Nb heures</th></tr></thead>
        <tbody>
          ${f4.specialites.map(s => `<tr><td>${s.libelle || "—"}</td><td>${s.code || "—"}</td><td>${s.nb}</td><td>${s.heures}</td></tr>`).join("")}
          ${f4.autres.nb || f4.autres.heures ? `<tr><td>Autres spécialités</td><td>—</td><td>${f4.autres.nb}</td><td>${f4.autres.heures}</td></tr>` : ""}
          <tr><td colspan="2"><strong>TOTAL (4)</strong></td><td><strong>${f4Total(f4).nb}</strong></td><td><strong>${f4Total(f4).heures}</strong></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre G — Stagiaires confiés par un autre organisme de formation</div>
    <div class="section-body grid-2">
      <div class="field"><label>Nombre de stagiaires</label><value>${bpf.g_nb_stagiaires ?? "—"}</value></div>
      <div class="field"><label>Nombre d'heures</label><value>${bpf.g_nb_heures ?? "—"}</value></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Cadre H — Personne ayant la qualité de dirigeant</div>
    <div class="section-body grid-2">
      <div class="field"><label>Nom et prénom</label><value>${bpf.dirigeant_nom_prenom || "—"}</value></div>
      <div class="field"><label>Qualité</label><value>${bpf.dirigeant_qualite || "—"}</value></div>
      <div class="field" style="grid-column: span 2;"><label>Fait à</label><value>${bpf.lieu_signature || "—"}, le ${bpf.valide_le ? fmtDate(bpf.valide_le) : dateDeclaration}</value></div>
    </div>
  </div>

  ${bpf.valide ? `
  <div style="text-align:center;margin:16px 0;">
    <div class="stamp">✓ BPF VALIDÉ le ${bpf.valide_le ? new Date(bpf.valide_le).toLocaleDateString("fr-FR") : dateDeclaration}</div>
  </div>` : ""}

  <div class="guide">
    <h3>📋 Guide de déclaration sur MAF (Mon Activité Formation)</h3>
    <ol>
      <li><strong>Connectez-vous</strong> sur le portail MAF avec votre compte EFP Connect :<br>
        <span class="url">https://www.monactiviteformation.emploi.gouv.fr/</span>
      </li>
      <li><strong>Sélectionnez "Déposer mon BPF"</strong> et choisissez l'exercice <strong>${bpf.annee}</strong>.</li>
      <li>Reportez les cadres A à H ci-dessus dans le même ordre — chaque ligne de ce document reprend exactement le numéro/lettre de la ligne officielle du Cerfa (1, 2, a, b, c...).</li>
      <li><strong>Validez et soumettez.</strong> Un accusé de réception électronique est généré — <strong>conservez-le précieusement</strong>.</li>
    </ol>
    <div class="warning">⚠️ <strong>Date limite :</strong> 30 avril de l'année suivante. Tout retard peut entraîner la caducité du NDA et une amende jusqu'à <strong>4 500 €</strong>.</div>
  </div>

  <div class="no-print" style="text-align:center;margin:20px 0;">
    <button onclick="window.print()" style="background:#f2901e;color:#fff;border:none;padding:12px 32px;border-radius:6px;font-size:12pt;font-weight:bold;cursor:pointer;">
      🖨️ Télécharger / Imprimer le PDF
    </button>
  </div>

  <div class="footer">
    Document généré par <strong>QalioFlex</strong> — by ExSenCo · ${dateDeclaration}<br>
    Ce document est un outil de préparation. La déclaration officielle doit être effectuée sur MAF.
  </div>
</div>
</body>
</html>`);
  win.document.close();
};

export default BPF;
