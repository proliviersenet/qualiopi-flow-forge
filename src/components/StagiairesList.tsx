import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { EVAL_TYPES } from "@/lib/documentTypes";

// Tick personnalisé pour l'axe des catégories (compétences/objectifs) du graphique à
// barres avant/après/à froid : découpe les libellés longs (rédigés en phrases) sur
// plusieurs lignes, centrées verticalement sur la barre, plutôt que de les laisser
// déborder ou d'être tronqués illisibles.
const CompetenceTick = (props: { x?: number; y?: number; payload?: { value: string } }) => {
  const { x = 0, y = 0, payload } = props;
  const words = String(payload?.value || "").split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((w) => {
    if ((current + " " + w).trim().length > 20) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  });
  if (current) lines.push(current);
  const shown = lines.slice(0, 2);
  const lineHeight = 11;
  const startDy = -((shown.length - 1) * lineHeight) / 2;
  return (
    <text x={x} y={y} textAnchor="end" fontSize={10} fill="#4b5563">
      {shown.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : lineHeight}>{line}</tspan>
      ))}
    </text>
  );
};

interface Stagiaire {
  id: string;
  nom: string;
  prenom: string;
  email_pro: string;
  telephone: string;
  doc_emargement?: string | null;
  doc_emargement_envoye_le?: string | null;
  doc_emargement_signe_le?: string | null;
  token_emargement?: string | null;
  doc_attestation?: string | null;
  doc_attestation_envoye_le?: string | null;
  token_attestation?: string | null;
  doc_livret?: string | null;
  doc_livret_envoye_le?: string | null;
  token_livret?: string | null;
  doc_questionnaire_avant?: string | null;
  doc_questionnaire_apres?: string | null;
  token_questionnaire_avant?: string | null;
  token_questionnaire_apres?: string | null;
  reponses_questionnaire_avant?: { competences?: Record<string, number>; objectifs?: Record<string, number> } | null;
  reponses_questionnaire_apres?: { competences?: Record<string, number>; objectifs?: Record<string, number> } | null;
  doc_evaluation_chaud?: string | null;
  doc_evaluation_chaud_envoye_le?: string | null;
  doc_evaluation_formateur?: string | null;
  doc_evaluation_froid?: string | null;
  doc_evaluation_froid_envoye_le?: string | null;
  token_evaluation_chaud?: string | null;
  token_evaluation_formateur?: string | null;
  token_evaluation_froid?: string | null;
  reponses_evaluation_chaud?: { notes?: Record<string, number>; commentaire?: string | null } | null;
  reponses_evaluation_formateur?: { notes?: Record<string, number>; commentaire?: string | null } | null;
  reponses_evaluation_froid?: { notes?: Record<string, number>; commentaire?: string | null } | null;
  formation_titre?: string;
  consentement_email?: boolean | null;
  consentement_email_date?: string | null;
  consentement_sms?: boolean | null;
  consentement_sms_date?: string | null;
}

// Point remonté par Olivier le 20/08 : un document manquant/non complété (badge
// "En attente") se fondait dans le reste de l'UI en gris, pas assez visible. Passé
// en rouge pour que ce qui bloque saute aux yeux — distinct du gris neutre gardé
// pour les statuts non applicables/inconnus (ex: valeur imprévue ci-dessous).
const docStatus = (val: string | null | undefined) => {
  if (!val) return { label: "En attente", color: "bg-red-50 text-red-700 border border-red-200" };
  if (val === "envoye") return { label: "Envoyé", color: "bg-blue-100 text-blue-600" };
  if (val === "signe") return { label: "Signé ✓", color: "bg-green-100 text-green-700" };
  if (val === "erreur") return { label: "Erreur ⚠️", color: "bg-red-100 text-red-600" };
  return { label: val, color: "bg-gray-100 text-gray-500" };
};

// Chantier 5 : alerte visuelle ⚠️ quand un document a été envoyé (lien transmis
// au stagiaire) mais reste non signé plus de 2 jours après — même seuil que la
// relance automatique J+2 côté serveur (relance-documents-auto). Sert juste à
// prévenir le formateur dans l'UI ; l'envoi de la relance/alerte réelle est géré
// côté serveur, indépendamment de l'ouverture ou non de cette page.
const joursDepuis = (dateIso: string | null | undefined): number | null => {
  if (!dateIso) return null;
  const diffMs = Date.now() - new Date(dateIso).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const alerteRetard = (statut: string | null | undefined, envoyeLe: string | null | undefined) => {
  if (statut !== "envoye") return null;
  const jours = joursDepuis(envoyeLe);
  if (jours === null || jours < 2) return null;
  return jours;
};

// Consentement RGPD opt-in (email/SMS) : reflète le choix explicite du stagiaire
// sur le formulaire public de positionnement (accepté / refusé / pas encore répondu).
const consentInfo = (val: boolean | null | undefined, date: string | null | undefined) => {
  const dateStr = date ? new Date(date).toLocaleDateString("fr-FR") : "";
  if (val === true) return { symbol: "✓", color: "text-green-600", title: `Consentement accepté${dateStr ? " le " + dateStr : ""}` };
  if (val === false) return { symbol: "✗", color: "text-red-500", title: `Consentement refusé${dateStr ? " le " + dateStr : ""}` };
  return { symbol: "–", color: "text-gray-300", title: "Consentement non renseigné (le stagiaire n'a pas encore répondu au questionnaire)" };
};

// Les 3 questionnaires d'évaluation stagiaire (chantier 2) — même token public
// que le questionnaire de positionnement, mais généré ici directement par le
// formateur (bouton "copier le lien"), car aucun mécanisme n'écrit encore ces
// tokens automatiquement lors d'une relance (limitation existante, cf.
// token_questionnaire_avant/apres — non traitée ici, chantier 3).
// EVAL_TYPES_LIST vient de src/lib/documentTypes.ts (source unique, partagée avec
// FormationDetail.tsx) — évite les 2 copies divergentes qui existaient avant
// (audit vocabulaire, juillet 2026).
const EVAL_TYPES_LIST = EVAL_TYPES;

// motifs : dérive ses 3 entrées "évaluation" de EVAL_TYPES_LIST plutôt que de les
// recopier en dur, pour rester synchronisé si un libellé change un jour.
const motifs = [
  { value: "livret", label: "Livret d'accueil" },
  { value: "questionnaire_avant", label: "Questionnaire positionnement avant" },
  { value: "emargement", label: "Feuille d'émargement" },
  { value: "questionnaire_apres", label: "Questionnaire positionnement après" },
  { value: `evaluation_${EVAL_TYPES[0].key}`, label: EVAL_TYPES[0].label },
  { value: `evaluation_${EVAL_TYPES[1].key}`, label: EVAL_TYPES[1].label },
  { value: "attestation", label: "Attestation de fin de formation" },
  { value: `evaluation_${EVAL_TYPES[2].key}`, label: EVAL_TYPES[2].label },
];

// Chantier 3 (audit du 13/08, suite du correctif du 01/08 sur declencher-flow-session
// et positionnement-public) : la relance MANUELLE (bouton "📨 Relancer" ci-dessous,
// handleRelance) appelait envoyer-relance sans jamais fournir de `lien` — pour un
// motif nécessitant une action du stagiaire (qui n'a pas de compte QalioFlex), le
// lien générique /espace-client renvoyé par défaut par envoyer-relance ne mène nulle
// part d'utilisable. On couvre ici les motifs qui ont déjà une page publique par
// token (mêmes routes que /positionnement, /emargement, /evaluation utilisées par
// declencher-flow-session, positionnement-public et genererLienEvaluation
// ci-dessus). Le token est réutilisé s'il existe déjà (jamais régénéré à chaque
// clic, sinon un lien déjà envoyé deviendrait invalide) — même logique que
// genererLienEvaluation.
// "livret" et "attestation" ont désormais elles aussi leur page de consultation
// publique par token (chantier "consultation directe livret/attestation",
// 19/08/2026) : /livret/:token et /attestation/:token, mêmes Edge Functions
// livret-public / attestation-public. Le token de l'attestation n'existe que si
// elle a déjà été générée au moins une fois (genererAttestation ci-dessous) —
// si absent, on affiche un message d'erreur au formateur plutôt que d'envoyer un
// lien qui pointerait vers une attestation inexistante (voir handleRelance).
const MOTIF_TOKEN_CONFIG: Record<string, { tokenField: keyof Stagiaire; path: string }> = {
  livret: { tokenField: "token_livret", path: "livret" },
  questionnaire_avant: { tokenField: "token_questionnaire_avant", path: "positionnement" },
  questionnaire_apres: { tokenField: "token_questionnaire_apres", path: "positionnement" },
  emargement: { tokenField: "token_emargement", path: "emargement" },
  evaluation_chaud: { tokenField: "token_evaluation_chaud", path: "evaluation" },
  evaluation_formateur: { tokenField: "token_evaluation_formateur", path: "evaluation" },
  evaluation_froid: { tokenField: "token_evaluation_froid", path: "evaluation" },
  attestation: { tokenField: "token_attestation", path: "attestation" },
};

const StagiairesList = ({
  sessionId,
  canRelance = false,
  envoye_par = "formateur",
  canal = "les_deux",
  formationTitre = "",
  showSynthese = false,
}: {
  sessionId: string;
  canRelance?: boolean;
  envoye_par?: "auto" | "formateur" | "client";
  canal?: "email" | "sms" | "les_deux";
  formationTitre?: string;
  showSynthese?: boolean;
}) => {
  const { toast } = useToast();
  const [stagiaires, setStagiaires] = useState<Stagiaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [relancing, setRelancing] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForm, setEditForm] = useState({ nom: "", prenom: "", email_pro: "", telephone: "" });
  const [saving, setSaving] = useState(false);
  // Attestations déjà générées, par stagiaire (stagiaire_id -> contenu_html). Document
  // individuel (contrairement au livret/émargement/devis qui sont propres à la session).
  const [attestations, setAttestations] = useState<Record<string, string>>({});
  const [generatingAttestation, setGeneratingAttestation] = useState<string | null>(null);

  // Correctif du 20/08 (Olivier) : les alertes "Actions requises" du Dashboard ne
  // menaient qu'à la fiche client, pas jusqu'au stagiaire concerné — il fallait
  // ensuite chercher la bonne ligne à la main. Le lien pointe maintenant vers
  // /clients/:id?stagiaire=<id>, lu ici directement (StagiairesList partage l'URL
  // de la page qui l'héberge) pour scroller jusqu'à la ligne et la surligner.
  const [searchParams] = useSearchParams();
  const highlightStagiaireId = searchParams.get("stagiaire");
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("stagiaires")
        .select("*")
        .eq("session_id", sessionId)
        .order("nom");
      const list = (data as Stagiaire[]) || [];
      setStagiaires(list);

      if (list.length > 0) {
        const { data: attData } = await supabase
          .from("documents_formation")
          .select("stagiaire_id, contenu_html")
          .in("stagiaire_id", list.map(s => s.id))
          .eq("type", "attestation");
        if (attData) {
          const map: Record<string, string> = {};
          (attData as { stagiaire_id: string; contenu_html: string | null }[]).forEach(d => {
            if (d.contenu_html) map[d.stagiaire_id] = d.contenu_html;
          });
          setAttestations(map);
        }
      }

      setLoading(false);
    };
    fetch();
  }, [sessionId]);

  useEffect(() => {
    if (!highlightStagiaireId || stagiaires.length === 0) return;
    if (!stagiaires.some(s => s.id === highlightStagiaireId)) return;
    const row = document.getElementById(`stagiaire-row-${highlightStagiaireId}`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(true);
  }, [highlightStagiaireId, stagiaires]);

  // Chantier 5 : blocage — l'attestation de fin de formation ne peut être générée
  // que si l'émargement ET l'évaluation à chaud sont tous les deux signés par le
  // stagiaire (exigence Qualiopi : traçabilité de l'assiduité + recueil de la
  // satisfaction avant la délivrance de l'attestation). Vérifié aussi côté
  // serveur dans generer-attestation (ce contrôle client n'est qu'un affichage).
  const peutGenererAttestation = (s: Stagiaire) =>
    s.doc_emargement === "signe" && s.doc_evaluation_chaud === "signe";

  // Génération de l'attestation réservée au formateur (comme livret/émargement/devis
  // dans ClientDetail.tsx) — le client ne fait que la consulter une fois disponible.
  //
  // Point non bloquant (audit 16/08) : à la différence de l'émargement et de
  // l'évaluation à chaud (exigences Qualiopi, bloquées côté serveur), la
  // notation du formateur par le stagiaire n'est PAS une obligation légale —
  // l'attestation est un document dont la délivrance ne doit pas être
  // conditionnée à une évaluation optionnelle (risque de la rendre perçue
  // comme "monnayée" contre un avis). On se contente donc d'un avertissement
  // ici, pas d'un verrou serveur comme pour les deux autres.
  const genererAttestation = async (stagiaire: Stagiaire) => {
    if (stagiaire.doc_evaluation_formateur !== "signe") {
      const continuer = window.confirm(
        "Ce stagiaire n'a pas encore noté le formateur. Il est recommandé d'attendre sa réponse avant de délivrer l'attestation. Générer quand même ?"
      );
      if (!continuer) return;
    }
    setGeneratingAttestation(stagiaire.id);
    const { data, error } = await supabase.functions.invoke("generer-attestation", {
      body: { stagiaire_id: stagiaire.id },
    });
    setGeneratingAttestation(null);

    if (error || data?.error) {
      let message = data?.error || error?.message;
      const ctx = (error as { context?: Response })?.context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = await ctx.clone().json();
          if (body?.error) message = body.error;
        } catch {
          // corps non-JSON, on garde le message par défaut
        }
      }
      toast({ title: "Erreur génération attestation", description: message, variant: "destructive" });
      return;
    }

    setAttestations(prev => ({ ...prev, [stagiaire.id]: data.contenu_html }));
    setStagiaires(prev => prev.map(s => s.id === stagiaire.id ? { ...s, doc_attestation: "envoye" } : s));
    toast({ title: "✅ Attestation générée" });
  };

  const voirAttestation = (stagiaireId: string) => {
    const html = attestations[stagiaireId];
    if (!html) return;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const openEdit = (s: Stagiaire) => {
    setEditingId(s.id);
    setEditForm({ nom: s.nom, prenom: s.prenom, email_pro: s.email_pro, telephone: s.telephone });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const { error } = await supabase.from("stagiaires").update({
      nom: editForm.nom,
      prenom: editForm.prenom,
      email_pro: editForm.email_pro,
      telephone: editForm.telephone,
    }).eq("id", editingId);
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setEditingId(null);
    toast({ title: "Stagiaire mis à jour" });
    const { data } = await supabase.from("stagiaires").select("*").eq("session_id", sessionId).order("nom");
    setStagiaires((data as Stagiaire[]) || []);
  };

  const deleteStagiaire = async (id: string) => {
    if (!confirm("Supprimer ce stagiaire ?")) return;
    const { error } = await supabase.from("stagiaires").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setStagiaires(prev => prev.filter(s => s.id !== id));
    toast({ title: "Stagiaire supprimé" });
  };

  const voirReponses = (s: Stagiaire, type: "avant" | "apres") => {
    const reponses = type === "avant" ? s.reponses_questionnaire_avant : s.reponses_questionnaire_apres;
    if (!reponses) return;
    const ligne = (libelle: string, note: number | undefined) =>
      `<tr><td style="padding:6px 10px;border:1px solid #eee;">${libelle}</td><td style="padding:6px 10px;border:1px solid #eee;text-align:center;font-weight:bold;">${note ?? "—"} / 4</td></tr>`;
    const competencesRows = Object.entries(reponses.competences || {}).map(([k, v]) => ligne(k, v)).join("");
    const objectifsRows = Object.entries(reponses.objectifs || {}).map(([k, v]) => ligne(k, v)).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Réponses — ${s.prenom} ${s.nom}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#1a1a2e;} h1{color:#25245e;font-size:16pt;} h2{color:#25245e;font-size:12pt;margin-top:20px;} table{border-collapse:collapse;width:100%;max-width:600px;font-size:10pt;}</style>
      </head><body>
      <h1>Questionnaire de positionnement ${type === "avant" ? "avant" : "après"} formation</h1>
      <p>${s.prenom} ${s.nom}</p>
      <h2>Compétences</h2>
      <table>${competencesRows || "<tr><td style='padding:6px;'>Aucune réponse</td></tr>"}</table>
      <h2>Objectifs</h2>
      <table>${objectifsRows || "<tr><td style='padding:6px;'>Aucune réponse</td></tr>"}</table>
      </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // Génère (si besoin) le token public du questionnaire d'évaluation demandé pour
  // ce stagiaire, puis copie le lien /evaluation/:token dans le presse-papiers.
  // Le token est réutilisé s'il existe déjà (pas de régénération à chaque clic,
  // sinon un lien déjà envoyé deviendrait invalide).
  const genererLienEvaluation = async (s: Stagiaire, type: "chaud" | "formateur" | "froid") => {
    const tokenField = `token_evaluation_${type}` as keyof Stagiaire;
    let token = s[tokenField] as string | null | undefined;
    if (!token) {
      token = crypto.randomUUID();
      const { error } = await supabase.from("stagiaires").update({ [tokenField]: token }).eq("id", s.id);
      if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
      setStagiaires(prev => prev.map(st => st.id === s.id ? { ...st, [tokenField]: token } as Stagiaire : st));
    }
    const url = `${window.location.origin}/evaluation/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "🔗 Lien copié", description: `Lien du questionnaire à transmettre à ${s.prenom} ${s.nom}.` });
    } catch {
      toast({ title: "Lien généré", description: url });
    }
  };

  const voirReponsesEvaluation = (s: Stagiaire, type: "chaud" | "formateur" | "froid") => {
    const reponses = s[`reponses_evaluation_${type}` as keyof Stagiaire] as { notes?: Record<string, number>; commentaire?: string | null } | null | undefined;
    if (!reponses) return;
    const libelleType = EVAL_TYPES_LIST.find(et => et.key === type)?.label || "Évaluation";
    const ligne = (libelle: string, note: number | undefined) =>
      `<tr><td style="padding:6px 10px;border:1px solid #eee;">${libelle}</td><td style="padding:6px 10px;border:1px solid #eee;text-align:center;font-weight:bold;">${note ?? "—"} / 4</td></tr>`;
    const rows = Object.entries(reponses.notes || {}).map(([k, v]) => ligne(k, v)).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Réponses — ${s.prenom} ${s.nom}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#1a1a2e;} h1{color:#25245e;font-size:16pt;} h2{color:#25245e;font-size:12pt;margin-top:20px;} table{border-collapse:collapse;width:100%;max-width:600px;font-size:10pt;}</style>
      </head><body>
      <h1>${libelleType}</h1>
      <p>${s.prenom} ${s.nom}</p>
      <table>${rows || "<tr><td style='padding:6px;'>Aucune réponse</td></tr>"}</table>
      ${reponses.commentaire ? `<h2>Commentaire</h2><p>${reponses.commentaire}</p>` : ""}
      </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  // Agrège les réponses de TOUS les stagiaires de la session (avant, puis après) pour
  // produire une moyenne par compétence/objectif — évite au formateur de devoir ouvrir
  // les réponses stagiaire par stagiaire pour se faire une idée du niveau du groupe.
  const calculerSynthese = (type: "avant" | "apres") => {
    const champ = type === "avant" ? "reponses_questionnaire_avant" : "reponses_questionnaire_apres";
    const repondants = stagiaires.filter(s => s[champ]);
    if (repondants.length === 0) return null;

    const agreger = (cle: "competences" | "objectifs") => {
      const totaux: Record<string, { somme: number; count: number }> = {};
      repondants.forEach(s => {
        const notes = s[champ]?.[cle] || {};
        Object.entries(notes).forEach(([libelle, note]) => {
          if (!totaux[libelle]) totaux[libelle] = { somme: 0, count: 0 };
          totaux[libelle].somme += Number(note);
          totaux[libelle].count += 1;
        });
      });
      return Object.entries(totaux).map(([libelle, { somme, count }]) => ({
        libelle, moyenne: somme / count, count,
      }));
    };

    return {
      nbRepondants: repondants.length,
      competences: agreger("competences"),
      objectifs: agreger("objectifs"),
    };
  };

  // Construit les données du graphique à barres pour une clé donnée (compétences ou
  // objectifs) en fusionnant avant/après sur les mêmes axes, pour visualiser la
  // progression en un coup d'œil.
  // syntheseFroidMap (optionnel) : moyennes de l'évaluation à froid par libellé — la
  // colonne reponses_evaluation_froid n'est pas séparée en competences/objectifs (ce
  // sont des questions libres, cf. évaluation_questions), donc on la fusionne par
  // simple correspondance de libellé avec les axes avant/après. Un libellé "à froid"
  // qui ne correspond à aucun axe avant/après (formation dont l'évaluation à froid
  // n'a pas été alignée sur les compétences) est silencieusement ignoré ici.
  const construireDonneesProgression = (
    syntheseAvant: ReturnType<typeof calculerSynthese>,
    syntheseApres: ReturnType<typeof calculerSynthese>,
    cle: "competences" | "objectifs",
    syntheseFroidMap?: Map<string, number>
  ) => {
    const avantMap = new Map((syntheseAvant?.[cle] || []).map(i => [i.libelle, i.moyenne]));
    const apresMap = new Map((syntheseApres?.[cle] || []).map(i => [i.libelle, i.moyenne]));
    const libelles = Array.from(new Set([...avantMap.keys(), ...apresMap.keys()]));
    if (libelles.length === 0) return null;
    return libelles.map(libelle => {
      const point: Record<string, string | number> = { subject: libelle };
      if (syntheseAvant) point.Avant = avantMap.get(libelle) ?? 0;
      if (syntheseApres) point.Après = apresMap.get(libelle) ?? 0;
      if (syntheseFroidMap && syntheseFroidMap.has(libelle)) {
        point["Froid (J+90)"] = syntheseFroidMap.get(libelle) as number;
      }
      return point;
    });
  };

  // Agrège les réponses "évaluation à froid" (J+90) de tous les stagiaires par
  // libellé de question — flat comme reponses_evaluation_froid.notes (pas de
  // séparation competences/objectifs à la source). Sert à alimenter le radar ROI
  // (avant/après/à froid) quand l'évaluation à froid a été alignée sur les mêmes
  // compétences/objectifs (cf. bouton "Reprendre les compétences", FormationDetail.tsx).
  const calculerSyntheseFroid = () => {
    const repondants = stagiaires.filter(s => s.reponses_evaluation_froid?.notes);
    if (repondants.length === 0) return { map: new Map<string, number>(), nbRepondants: 0 };
    const totaux: Record<string, { somme: number; count: number }> = {};
    repondants.forEach(s => {
      const notes = s.reponses_evaluation_froid?.notes || {};
      Object.entries(notes).forEach(([libelle, note]) => {
        if (!totaux[libelle]) totaux[libelle] = { somme: 0, count: 0 };
        totaux[libelle].somme += Number(note);
        totaux[libelle].count += 1;
      });
    });
    const map = new Map(Object.entries(totaux).map(([libelle, { somme, count }]) => [libelle, somme / count]));
    return { map, nbRepondants: repondants.length };
  };

  // Note formateur affichée au client : moyenne de TOUTES les réponses de
  // l'évaluation formateur (toutes questions, tous stagiaires confondus), convertie
  // de l'échelle native 0-4 vers une note sur 5 — plus lisible pour un client que
  // "2.8/4". Il n'existe pas encore de "note globale" unique côté formulaire (chaque
  // question est notée séparément), donc c'est une moyenne, pas une valeur saisie
  // isolément par les stagiaires.
  const calculerNoteFormateur = () => {
    const repondants = stagiaires.filter(s => s.reponses_evaluation_formateur?.notes);
    if (repondants.length === 0) return null;
    const valeurs: number[] = [];
    repondants.forEach(s => {
      Object.values(s.reponses_evaluation_formateur?.notes || {}).forEach(v => {
        if (typeof v === "number") valeurs.push(v);
      });
    });
    if (valeurs.length === 0) return null;
    const moyenneSur4 = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
    return { note: (moyenneSur4 / 4) * 5, nbRepondants: repondants.length };
  };

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\s/g, "");
    if (cleaned.length === 9 && !cleaned.startsWith("0")) return "0" + cleaned;
    return cleaned;
  };

  const addStagiaire = async () => {
    if (!editForm.nom || !editForm.prenom) {
      toast({ title: "Nom et prénom obligatoires", variant: "destructive" }); return;
    }
    setSaving(true);
    const { data: session } = await supabase.from("sessions").select("client_id").eq("id", sessionId).single();
    const { error } = await supabase.from("stagiaires").insert({
      session_id: sessionId,
      client_id: (session as Record<string, string>)?.client_id || null,
      nom: editForm.nom,
      prenom: editForm.prenom,
      email_pro: editForm.email_pro,
      telephone: normalizePhone(editForm.telephone),
    });
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setShowAddForm(false);
    setEditForm({ nom: "", prenom: "", email_pro: "", telephone: "" });
    toast({ title: "Stagiaire ajouté" });
    const { data } = await supabase.from("stagiaires").select("*").eq("session_id", sessionId).order("nom");
    setStagiaires((data as Stagiaire[]) || []);
  };

  const handleRelance = async (stagiaire: Stagiaire, motif: string) => {
    // Garde-fou RGPD : on ne sollicite jamais un stagiaire sur un canal qu'il a
    // explicitement refusé (opt-out) — condition posée par Brevo pour l'envoi.
    const emailRefuse = stagiaire.consentement_email === false;
    const smsRefuse = stagiaire.consentement_sms === false;
    const canalBloque =
      (canal === "email" && emailRefuse) ||
      (canal === "sms" && smsRefuse) ||
      (canal === "les_deux" && emailRefuse && smsRefuse);
    if (canalBloque) {
      toast({
        title: "Envoi bloqué",
        description: `${stagiaire.prenom} ${stagiaire.nom} a refusé d'être contacté(e) sur ce canal (consentement RGPD).`,
        variant: "destructive",
      });
      return;
    }

    // Garde-fou spécifique à l'attestation : contrairement aux autres motifs à
    // token, l'attestation n'existe que si elle a déjà été générée au moins une
    // fois (bouton "Générer l'attestation" ci-dessous) — sans ça, générer un
    // token_attestation enverrait un lien pointant vers une attestation
    // inexistante (cf. commentaire sur MOTIF_TOKEN_CONFIG).
    if (motif === "attestation" && stagiaire.doc_attestation !== "envoye") {
      toast({
        title: "Attestation non générée",
        description: `Générez d'abord l'attestation de ${stagiaire.prenom} ${stagiaire.nom} avant de la relancer.`,
        variant: "destructive",
      });
      return;
    }

    setRelancing(stagiaire.id + motif);
    try {
      // Chantier 3 (audit du 13/08) : cf. commentaire sur MOTIF_TOKEN_CONFIG —
      // génère/réutilise le token public et construit le lien direct pour les
      // motifs qui ont une page de consultation par token, avant d'appeler
      // envoyer-relance (sinon celle-ci retombe sur /espace-client, inutilisable
      // par un stagiaire sans compte).
      let lien: string | undefined;
      const tokenConfig = MOTIF_TOKEN_CONFIG[motif];
      if (tokenConfig) {
        let token = stagiaire[tokenConfig.tokenField] as string | null | undefined;
        if (!token) {
          token = crypto.randomUUID();
          const { error: tokenErr } = await supabase
            .from("stagiaires")
            .update({ [tokenConfig.tokenField]: token })
            .eq("id", stagiaire.id);
          if (tokenErr) {
            toast({ title: "Erreur", description: tokenErr.message, variant: "destructive" });
            setRelancing(null);
            return;
          }
          setStagiaires(prev => prev.map(st => st.id === stagiaire.id ? { ...st, [tokenConfig.tokenField]: token } as Stagiaire : st));
        }
        lien = `${window.location.origin}/${tokenConfig.path}/${token}`;
      }

      const { data, error } = await supabase.functions.invoke("envoyer-relance", {
        body: {
          prenom: stagiaire.prenom,
          nom: stagiaire.nom,
          email: stagiaire.email_pro,
          telephone: stagiaire.telephone,
          formation_titre: formationTitre,
          motif,
          canal,
          envoye_par,
          stagiaire_id: stagiaire.id,
          ...(lien ? { lien } : {}),
        },
      });

      console.log("Réponse relance:", JSON.stringify(data), JSON.stringify(error));

      if (error || data?.error) {
        const errMsg = error?.message || data?.error || "Erreur inconnue";
        throw new Error(errMsg);
      }

      const results = data?.results || {};
      const sentChannels = [];
      if (results.email) sentChannels.push("email");
      if (results.sms) sentChannels.push("SMS");
      const channelLabel = sentChannels.length > 0 ? sentChannels.join(" et ") : "aucun canal";

      toast({
        title: "✅ Relance envoyée",
        description: `${stagiaire.prenom} ${stagiaire.nom} relancé par ${channelLabel}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast({ title: "Erreur relance", description: msg, variant: "destructive" });
    } finally {
      setRelancing(null);
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Chargement des stagiaires...</p>;
  // Point non bloquant (audit test grandeur réelle 01/08) : avec 0 stagiaire, ce
  // composant se masquait entièrement — y compris le bouton "+ Ajouter un
  // stagiaire". Sur une session neuve (formateur comme client, canRelance=true
  // dans les deux seuls usages actuels), il devenait donc impossible d'ajouter
  // le tout premier stagiaire depuis cette page. On garde le masquage complet
  // uniquement pour un éventuel affichage lecture seule (canRelance=false).
  if (stagiaires.length === 0 && !canRelance) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-700">
          👥 Stagiaires ({stagiaires.length})
        </p>
        {canRelance && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowAddForm(true); setEditForm({ nom: "", prenom: "", email_pro: "", telephone: "" }); }}>
            + Ajouter un stagiaire
          </Button>
        )}
      </div>

      {/* Chantier 5 : voyant d'alerte au niveau de la session — agrège les retards de
          tous les stagiaires (émargement, éval à chaud, éval à froid) plutôt que de
          laisser le formateur les repérer un par un via les badges ⚠️ de chaque ligne.
          Mêmes seuils que côté serveur (relance-documents-auto) : ⚠️ dès J+2 (relance déjà
          partie), 🚨 à partir de J+5 (alerte formateur + client déjà déclenchée). */}
      {(() => {
        const alertes: { nom: string; label: string; jours: number }[] = [];
        stagiaires.forEach(s => {
          const em = alerteRetard(s.doc_emargement, s.doc_emargement_envoye_le);
          if (em !== null) alertes.push({ nom: `${s.prenom} ${s.nom}`, label: "la feuille d'émargement", jours: em });
          const ch = alerteRetard(s.doc_evaluation_chaud, s.doc_evaluation_chaud_envoye_le);
          if (ch !== null) alertes.push({ nom: `${s.prenom} ${s.nom}`, label: "l'évaluation à chaud", jours: ch });
          const fr = alerteRetard(s.doc_evaluation_froid, s.doc_evaluation_froid_envoye_le);
          if (fr !== null) alertes.push({ nom: `${s.prenom} ${s.nom}`, label: "l'évaluation à froid", jours: fr });
        });
        if (alertes.length === 0) return null;
        alertes.sort((a, b) => b.jours - a.jours);
        const critiques = alertes.filter(a => a.jours >= 5);
        const bg = critiques.length > 0 ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200";
        const text = critiques.length > 0 ? "text-red-700" : "text-orange-700";
        return (
          <div className={`border rounded-lg p-3 mb-4 ${bg}`}>
            <p className={`text-xs font-semibold mb-1 ${text}`}>
              {critiques.length > 0 ? "🚨" : "⚠️"} {alertes.length} document{alertes.length > 1 ? "s" : ""} en attente de signature depuis plus de 2 jours
              {critiques.length > 0 && ` — dont ${critiques.length} depuis plus de 5 jours (alerte déjà envoyée au formateur et au client)`}
            </p>
            <ul className="text-[11px] text-gray-600 space-y-0.5 mt-1">
              {alertes.map((a, i) => (
                <li key={i}>
                  • <strong>{a.nom}</strong> — {a.label}, envoyée depuis {a.jours} jour{a.jours > 1 ? "s" : ""}
                  {a.jours >= 5 ? " 🚨" : ""}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Synthèse questionnaire de positionnement — barres avant/après (+ à froid J+90 si
          disponible) groupées par compétence, plus lisible pour comparer une progression
          qu'un radar dès qu'il y a plus de 3-4 axes. Affichée côté formateur
          (ClientDetail.tsx) ET côté client (EspaceClient.tsx). */}
      {showSynthese && (() => {
        const syntheseAvant = calculerSynthese("avant");
        const syntheseApres = calculerSynthese("apres");
        if (!syntheseAvant && !syntheseApres) return null;
        const syntheseFroid = calculerSyntheseFroid();
        const hasFroid = syntheseFroid.map.size > 0;
        const dataCompetences = construireDonneesProgression(syntheseAvant, syntheseApres, "competences", syntheseFroid.map);
        const dataObjectifs = construireDonneesProgression(syntheseAvant, syntheseApres, "objectifs", syntheseFroid.map);
        if (!dataCompetences && !dataObjectifs) return null;
        // Un seul graphique horizontal : compétences ET objectifs sont fusionnés dans la
        // même liste de lignes (au lieu de 2 graphiques côte à côte), Avant/Après/Froid
        // restant les couleurs de barre — recentré pour tenir "en un coup d'œil".
        const dataProgression = [...(dataCompetences || []), ...(dataObjectifs || [])];
        const noteFormateur = calculerNoteFormateur();

        // Hauteur réelle nécessaire pour que chaque ligne reste lisible (une ligne par
        // compétence/objectif). Certaines formations plus anciennes (créées avant le
        // plafond de 15 questions imposé côté génération) ont beaucoup plus de lignes —
        // sans plafond, le bloc explosait en hauteur et devenait illisible. Au-delà de
        // MAX_VISIBLE, on garde la hauteur des lignes (donc les barres restent lisibles)
        // mais on plafonne la zone visible et on scrolle dedans, plutôt que de tasser
        // les lignes pour les faire toutes rentrer.
        const ROW_HEIGHT = 24;
        const MAX_VISIBLE = 240;
        const chartHeight = Math.max(90, dataProgression.length * ROW_HEIGHT);
        const scrollable = chartHeight > MAX_VISIBLE;

        // Légende compacte, une seule fois au-dessus du graphique — mêmes couleurs que
        // les <Bar> ci-dessous.
        const legendeItem = (label: string, couleur: string) => (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: couleur }} />
            {label}
          </span>
        );

        return (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <p className="text-xs font-semibold text-gray-700">📊 ROI formation — progression des compétences</p>
              <p className="text-[11px] text-gray-400">
                {syntheseAvant ? `Avant : ${syntheseAvant.nbRepondants} réponse${syntheseAvant.nbRepondants > 1 ? "s" : ""}` : ""}
                {syntheseAvant && syntheseApres ? " · " : ""}
                {syntheseApres ? `Après : ${syntheseApres.nbRepondants} réponse${syntheseApres.nbRepondants > 1 ? "s" : ""}` : ""}
                {(syntheseAvant || syntheseApres) && hasFroid ? " · " : ""}
                {hasFroid ? `À froid : ${syntheseFroid.nbRepondants} réponse${syntheseFroid.nbRepondants > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            {noteFormateur && (
              <p className="text-xs text-gray-600 mb-1">
                🧑‍🏫 Note formateur (moyenne des évaluations stagiaires) : <strong>{noteFormateur.note.toFixed(1)}/5</strong>
                <span className="text-gray-400"> · {noteFormateur.nbRepondants} réponse{noteFormateur.nbRepondants > 1 ? "s" : ""}</span>
              </p>
            )}
            <div className="flex items-center gap-3 text-[11px] text-gray-600 mb-1">
              {syntheseAvant && legendeItem("Avant", "#25245e")}
              {syntheseApres && legendeItem("Après", "#f2901e")}
              {hasFroid && legendeItem("Froid (J+90)", "#16a34a")}
            </div>
            <div style={scrollable ? { maxHeight: MAX_VISIBLE, overflowY: "auto" } : undefined}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={dataProgression} layout="vertical" barGap={2} barCategoryGap="25%" margin={{ top: 2, right: 14, left: 4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" domain={[0, 4]} tick={{ fontSize: 9, fill: "#9ca3af" }} height={16} />
                  <YAxis type="category" dataKey="subject" width={140} tick={<CompetenceTick />} />
                  <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}/4`} />
                  {syntheseAvant && (
                    <Bar name="Avant" dataKey="Avant" fill="#25245e" radius={[0, 3, 3, 0]} barSize={8} />
                  )}
                  {syntheseApres && (
                    <Bar name="Après" dataKey="Après" fill="#f2901e" radius={[0, 3, 3, 0]} barSize={8} />
                  )}
                  {hasFroid && (
                    <Bar name="Froid (J+90)" dataKey="Froid (J+90)" fill="#16a34a" radius={[0, 3, 3, 0]} barSize={8} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {scrollable && (
              <p className="text-[10px] text-gray-400 mt-0.5">
                ↕ Faites défiler pour voir les {dataProgression.length} lignes.
              </p>
            )}
          </div>
        );
      })()}

      {/* Formulaire ajout */}
      {showAddForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 space-y-2">
          <p className="text-xs font-semibold text-blue-700 mb-2">Nouveau stagiaire</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Prénom *" value={editForm.prenom} onChange={e => setEditForm(p => ({ ...p, prenom: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Nom *" value={editForm.nom} onChange={e => setEditForm(p => ({ ...p, nom: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Email pro" value={editForm.email_pro} onChange={e => setEditForm(p => ({ ...p, email_pro: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Mobile (0612345678)" value={editForm.telephone} onChange={e => setEditForm(p => ({ ...p, telephone: e.target.value }))} className="h-7 text-xs" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" className="h-7 text-xs" style={{ background: "#f2901e", color: "#fff" }} onClick={addStagiaire} disabled={saving}>{saving ? "..." : "Ajouter"}</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>Annuler</Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Nom</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Prénom</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Email</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium">Mobile</th>
              <th className="text-left py-2 pr-3 text-gray-500 font-medium" title="Consentement RGPD opt-in email et SMS donné par le stagiaire">Opt-in ✉️/📱</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Q. Avant</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Émargement</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Q. Après</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium">Attestation</th>
              <th className="text-left py-2 pr-2 text-gray-500 font-medium" title="Cliquez sur un icône pour copier le lien du questionnaire, ou pour voir les réponses une fois complété">Évaluations</th>
              {canRelance && <th className="text-left py-2 pr-2 text-gray-500 font-medium">Relance</th>}
              {canRelance && <th className="text-left py-2 text-gray-500 font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {stagiaires.map((s) => {
              const questAvant = docStatus(s.doc_questionnaire_avant);
              const emargement = docStatus(s.doc_emargement);
              const questApres = docStatus(s.doc_questionnaire_apres);
              const attestation = docStatus(s.doc_attestation);
              const allSigned = s.doc_questionnaire_avant === "signe" && s.doc_emargement === "signe" && s.doc_questionnaire_apres === "signe" && s.doc_attestation === "signe";
              const needsRelance = !allSigned;

              return (
                <>
                <tr
                  key={s.id}
                  id={`stagiaire-row-${s.id}`}
                  className={`border-b border-gray-50 ${
                    highlighted && highlightStagiaireId === s.id
                      ? "bg-amber-100 ring-1 ring-inset ring-amber-400"
                      : allSigned ? "bg-green-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-medium text-gray-800">{s.nom}</td>
                  <td className="py-2 pr-3 text-gray-700">{s.prenom}</td>
                  <td className="py-2 pr-3 text-gray-500">{s.email_pro || "—"}</td>
                  <td className="py-2 pr-3 text-gray-500">{s.telephone || "—"}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold ${consentInfo(s.consentement_email, s.consentement_email_date).color}`}
                        title={`Email — ${consentInfo(s.consentement_email, s.consentement_email_date).title}`}
                      >
                        ✉️{consentInfo(s.consentement_email, s.consentement_email_date).symbol}
                      </span>
                      <span
                        className={`text-xs font-bold ${consentInfo(s.consentement_sms, s.consentement_sms_date).color}`}
                        title={`SMS — ${consentInfo(s.consentement_sms, s.consentement_sms_date).title}`}
                      >
                        📱{consentInfo(s.consentement_sms, s.consentement_sms_date).symbol}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    {s.doc_questionnaire_avant === "signe" ? (
                      <button onClick={() => voirReponses(s, "avant")} title="Voir les réponses">
                        <Badge className={`text-xs px-1.5 py-0.5 ${questAvant.color} cursor-pointer hover:opacity-75`}>{questAvant.label}</Badge>
                      </button>
                    ) : canRelance ? (
                      // Correctif du 20/08 : le badge "En attente" était inerte —
                      // il faut relancer via le menu "📨 Relancer" à part. Cliquer
                      // directement sur le badge relance maintenant ce questionnaire.
                      <button
                        className="disabled:cursor-default disabled:opacity-60"
                        disabled={relancing !== null}
                        onClick={() => handleRelance(s, "questionnaire_avant")}
                        title="Cliquer pour relancer le stagiaire sur ce questionnaire"
                      >
                        <Badge className={`text-xs px-1.5 py-0.5 ${questAvant.color} cursor-pointer hover:opacity-75`}>{questAvant.label}</Badge>
                      </button>
                    ) : (
                      <Badge className={`text-xs px-1.5 py-0.5 ${questAvant.color}`}>{questAvant.label}</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      {s.doc_emargement !== "signe" && canRelance && s.doc_questionnaire_avant === "signe" ? (
                        <button
                          className="disabled:cursor-default disabled:opacity-60"
                          disabled={relancing !== null}
                          onClick={() => handleRelance(s, "emargement")}
                          title="Cliquer pour relancer le stagiaire sur l'émargement"
                        >
                          <Badge className={`text-xs px-1.5 py-0.5 ${emargement.color} cursor-pointer hover:opacity-75`}>{emargement.label}</Badge>
                        </button>
                      ) : (
                        <Badge className={`text-xs px-1.5 py-0.5 ${emargement.color}`}>{emargement.label}</Badge>
                      )}
                      {!s.doc_emargement && s.doc_questionnaire_avant !== "signe" && (
                        <span title="Bloqué : le questionnaire avant formation doit être complété par le stagiaire avant de pouvoir lui envoyer l'émargement." className="text-gray-400 text-xs">🔒</span>
                      )}
                      {(() => {
                        const retard = alerteRetard(s.doc_emargement, s.doc_emargement_envoye_le);
                        return retard !== null ? (
                          <span title={`Envoyé il y a ${retard} jour${retard > 1 ? "s" : ""}, toujours non signé`} className="text-orange-500 text-xs">⚠️{retard}j</span>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    {s.doc_questionnaire_apres === "signe" ? (
                      <button onClick={() => voirReponses(s, "apres")} title="Voir les réponses">
                        <Badge className={`text-xs px-1.5 py-0.5 ${questApres.color} cursor-pointer hover:opacity-75`}>{questApres.label}</Badge>
                      </button>
                    ) : canRelance ? (
                      <button
                        className="disabled:cursor-default disabled:opacity-60"
                        disabled={relancing !== null}
                        onClick={() => handleRelance(s, "questionnaire_apres")}
                        title="Cliquer pour relancer le stagiaire sur ce questionnaire"
                      >
                        <Badge className={`text-xs px-1.5 py-0.5 ${questApres.color} cursor-pointer hover:opacity-75`}>{questApres.label}</Badge>
                      </button>
                    ) : (
                      <Badge className={`text-xs px-1.5 py-0.5 ${questApres.color}`}>{questApres.label}</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {attestations[s.id] ? (
                      <button className="cursor-pointer" onClick={() => voirAttestation(s.id)} title="Voir l'attestation">
                        <Badge className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 hover:opacity-75">Générée ✓</Badge>
                      </button>
                    ) : envoye_par === "formateur" ? (
                      peutGenererAttestation(s) ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm" variant="outline" className="h-6 text-xs px-2"
                            disabled={generatingAttestation === s.id}
                            onClick={() => genererAttestation(s)}
                          >
                            {generatingAttestation === s.id ? "..." : "🎓 Générer"}
                          </Button>
                          {s.doc_evaluation_formateur !== "signe" && (
                            <span title="Le stagiaire n'a pas encore noté le formateur (non bloquant)." className="text-amber-500 text-xs">⚠️</span>
                          )}
                        </div>
                      ) : (
                        <Badge
                          className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-400"
                          title="Bloqué : l'émargement et l'évaluation à chaud doivent être signés avant de générer l'attestation."
                        >
                          🔒 En attente
                        </Badge>
                      )
                    ) : (
                      <Badge className={`text-xs px-1.5 py-0.5 ${attestation.color}`}>{attestation.label}</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex gap-1 items-center">
                      {EVAL_TYPES_LIST.map(et => {
                        const status = s[`doc_evaluation_${et.key}` as keyof Stagiaire] as string | null | undefined;
                        const st = docStatus(status);
                        const envoyeLe = et.key !== "formateur" ? (s[`doc_evaluation_${et.key}_envoye_le` as keyof Stagiaire] as string | null | undefined) : null;
                        const retard = alerteRetard(status, envoyeLe);
                        if (status === "signe") {
                          return (
                            <button key={et.key} onClick={() => voirReponsesEvaluation(s, et.key)} title={`${et.label} — voir les réponses`}>
                              <Badge className={`text-xs px-1 py-0.5 ${st.color} cursor-pointer hover:opacity-75`}>{et.icon}✓</Badge>
                            </button>
                          );
                        }
                        return (
                          <span key={et.key} className="flex items-center gap-0.5">
                            <button onClick={() => genererLienEvaluation(s, et.key)} title={`${et.label} — ${status ? "copier à nouveau le lien" : "générer et copier le lien"}`}>
                              <Badge className={`text-xs px-1 py-0.5 ${st.color} cursor-pointer hover:opacity-75`}>{et.icon}{status ? "" : "+"}</Badge>
                            </button>
                            {retard !== null && (
                              <span title={`${et.label} envoyée il y a ${retard} jour${retard > 1 ? "s" : ""}, toujours non complétée`} className="text-orange-500 text-xs">⚠️{retard}j</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  {canRelance && (
                    <td className="py-2 pr-2">
                      {needsRelance ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-orange-300 text-orange-600 hover:bg-orange-50" disabled={relancing !== null}>
                              {relancing?.startsWith(s.id) ? "..." : "📨 Relancer"}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {motifs.map(m => {
                              // Chantier 5 : le questionnaire avant formation doit être
                              // complété avant de pouvoir solliciter la signature de
                              // l'émargement (bloqué aussi côté serveur, cf. envoyer-relance).
                              const bloque = m.value === "emargement" && s.doc_questionnaire_avant !== "signe";
                              return (
                                <DropdownMenuItem
                                  key={m.value}
                                  disabled={bloque}
                                  onClick={() => !bloque && handleRelance(s, m.value)}
                                  className="text-xs cursor-pointer"
                                  title={bloque ? "Questionnaire avant formation non complété" : undefined}
                                >
                                  {bloque ? "🔒 " : ""}{m.label}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-xs text-green-600">✓ Complet</span>
                      )}
                    </td>
                  )}
                  {canRelance && (
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => openEdit(s)}>✏️</Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-red-200 text-red-500 hover:bg-red-50" onClick={() => deleteStagiaire(s.id)}>🗑</Button>
                      </div>
                    </td>
                  )}
                </tr>
                {/* Formulaire édition inline */}
                {editingId === s.id && (
                  <tr>
                    <td colSpan={10} className="py-2 px-0">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-semibold text-yellow-700">Modifier le stagiaire</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Prénom" value={editForm.prenom} onChange={e => setEditForm(p => ({ ...p, prenom: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Nom" value={editForm.nom} onChange={e => setEditForm(p => ({ ...p, nom: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Email pro" value={editForm.email_pro} onChange={e => setEditForm(p => ({ ...p, email_pro: e.target.value }))} className="h-7 text-xs" />
                          <Input placeholder="Mobile" value={editForm.telephone} onChange={e => setEditForm(p => ({ ...p, telephone: e.target.value }))} className="h-7 text-xs" />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" style={{ background: "#f2901e", color: "#fff" }} onClick={saveEdit} disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Annuler</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Résumé avancement — basé sur les statuts réellement suivis aujourd'hui
          (questionnaires + attestations). L'ancien compteur se basait sur
          doc_programme, un champ jamais écrit nulle part : il affichait "en
          attente" en permanence quel que soit l'état réel. */}
      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap">
        <span>📝 Q. avant complété : {stagiaires.filter(s => s.doc_questionnaire_avant === "signe").length}/{stagiaires.length}</span>
        <span>✍️ Émargement signé : {stagiaires.filter(s => s.doc_emargement === "signe").length}/{stagiaires.length}</span>
        <span>📝 Q. après complété : {stagiaires.filter(s => s.doc_questionnaire_apres === "signe").length}/{stagiaires.length}</span>
        <span>🎓 Attestations générées : {stagiaires.filter(s => attestations[s.id]).length}/{stagiaires.length}</span>
        <span>🔥 Éval. à chaud complétée : {stagiaires.filter(s => s.doc_evaluation_chaud === "signe").length}/{stagiaires.length}</span>
        <span>🧑‍🏫 Éval. formateur complétée : {stagiaires.filter(s => s.doc_evaluation_formateur === "signe").length}/{stagiaires.length}</span>
        <span>📈 Éval. à froid complétée : {stagiaires.filter(s => s.doc_evaluation_froid === "signe").length}/{stagiaires.length}</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">
        Opt-in ✉️/📱 : ✓ accepté · ✗ refusé · – pas encore répondu (consentement RGPD recueilli sur le questionnaire de positionnement)
      </p>
    </div>
  );
};

export default StagiairesList;
