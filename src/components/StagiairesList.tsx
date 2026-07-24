import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";

// Tick personnalisé pour l'axe des angles du radar : découpe les libellés longs
// (compétences/objectifs rédigés en phrases) sur plusieurs lignes plutôt que de
// les laisser déborder ou d'être tronqués illisibles.
const RadarTick = (props: { x?: number; y?: number; payload?: { value: string }; textAnchor?: string }) => {
  const { x = 0, y = 0, payload, textAnchor = "middle" } = props;
  const words = String(payload?.value || "").split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((w) => {
    if ((current + " " + w).trim().length > 16) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  });
  if (current) lines.push(current);
  const shown = lines.slice(0, 3);
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={9} fill="#4b5563">
      {shown.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 11}>{line}</tspan>
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
  doc_convention?: string | null;
  doc_programme?: string | null;
  doc_emargement?: string | null;
  doc_attestation?: string | null;
  doc_questionnaire_avant?: string | null;
  doc_questionnaire_apres?: string | null;
  reponses_questionnaire_avant?: { competences?: Record<string, number>; objectifs?: Record<string, number> } | null;
  reponses_questionnaire_apres?: { competences?: Record<string, number>; objectifs?: Record<string, number> } | null;
  formation_titre?: string;
  consentement_email?: boolean | null;
  consentement_email_date?: string | null;
  consentement_sms?: boolean | null;
  consentement_sms_date?: string | null;
}

const docStatus = (val: string | null | undefined) => {
  if (!val) return { label: "En attente", color: "bg-gray-100 text-gray-400" };
  if (val === "envoye") return { label: "Envoyé", color: "bg-blue-100 text-blue-600" };
  if (val === "signe") return { label: "Signé ✓", color: "bg-green-100 text-green-700" };
  if (val === "erreur") return { label: "Erreur ⚠️", color: "bg-red-100 text-red-600" };
  return { label: val, color: "bg-gray-100 text-gray-500" };
};

// Consentement RGPD opt-in (email/SMS) : reflète le choix explicite du stagiaire
// sur le formulaire public de positionnement (accepté / refusé / pas encore répondu).
const consentInfo = (val: boolean | null | undefined, date: string | null | undefined) => {
  const dateStr = date ? new Date(date).toLocaleDateString("fr-FR") : "";
  if (val === true) return { symbol: "✓", color: "text-green-600", title: `Consentement accepté${dateStr ? " le " + dateStr : ""}` };
  if (val === false) return { symbol: "✗", color: "text-red-500", title: `Consentement refusé${dateStr ? " le " + dateStr : ""}` };
  return { symbol: "–", color: "text-gray-300", title: "Consentement non renseigné (le stagiaire n'a pas encore répondu au questionnaire)" };
};

const motifs = [
  { value: "livret", label: "Livret d'accueil" },
  { value: "questionnaire_avant", label: "Questionnaire positionnement avant" },
  { value: "emargement", label: "Feuille d'émargement" },
  { value: "questionnaire_apres", label: "Questionnaire positionnement après" },
  { value: "evaluation_chaud", label: "Évaluation à chaud" },
  { value: "evaluation_formateur", label: "Évaluation du formateur" },
  { value: "attestation", label: "Attestation de fin de formation" },
  { value: "evaluation_froid", label: "Évaluation à froid (J+90)" },
];

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

  // Génération de l'attestation réservée au formateur (comme livret/émargement/devis
  // dans ClientDetail.tsx) — le client ne fait que la consulter une fois disponible.
  const genererAttestation = async (stagiaire: Stagiaire) => {
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

  // Construit les données du radar pour une clé donnée (compétences ou objectifs) en
  // fusionnant avant/après sur les mêmes axes, pour visualiser la progression en un coup d'œil.
  const construireRadarData = (
    syntheseAvant: ReturnType<typeof calculerSynthese>,
    syntheseApres: ReturnType<typeof calculerSynthese>,
    cle: "competences" | "objectifs"
  ) => {
    const avantMap = new Map((syntheseAvant?.[cle] || []).map(i => [i.libelle, i.moyenne]));
    const apresMap = new Map((syntheseApres?.[cle] || []).map(i => [i.libelle, i.moyenne]));
    const libelles = Array.from(new Set([...avantMap.keys(), ...apresMap.keys()]));
    if (libelles.length === 0) return null;
    return libelles.map(libelle => {
      const point: Record<string, string | number> = { subject: libelle };
      if (syntheseAvant) point.Avant = avantMap.get(libelle) ?? 0;
      if (syntheseApres) point.Après = apresMap.get(libelle) ?? 0;
      return point;
    });
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

    setRelancing(stagiaire.id + motif);
    try {
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
        },
      });

      console.log("Réponse relance:", JSON.stringify(data), JSON.stringify(error));

      if (error || data?.error) {
        let errMsg = error?.message || data?.error || "Erreur inconnue";
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
  if (stagiaires.length === 0) return null;

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

      {/* Synthèse questionnaire de positionnement — format radar, avant/après superposés
          sur les mêmes axes pour visualiser la progression du groupe. Affichée côté
          formateur (ClientDetail.tsx) ET côté client (EspaceClient.tsx). */}
      {showSynthese && (() => {
        const syntheseAvant = calculerSynthese("avant");
        const syntheseApres = calculerSynthese("apres");
        if (!syntheseAvant && !syntheseApres) return null;
        const radarCompetences = construireRadarData(syntheseAvant, syntheseApres, "competences");
        const radarObjectifs = construireRadarData(syntheseAvant, syntheseApres, "objectifs");
        if (!radarCompetences && !radarObjectifs) return null;

        const radar = (titre: string, data: Record<string, string | number>[]) => (
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide text-center mb-1">{titre}</p>
            <ResponsiveContainer width="100%" height={340}>
              <RadarChart data={data} outerRadius="70%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={<RadarTick />} />
                <PolarRadiusAxis domain={[0, 4]} tickCount={5} tick={{ fontSize: 9, fill: "#9ca3af" }} />
                {syntheseAvant && (
                  <Radar name="Avant" dataKey="Avant" stroke="#25245e" fill="#25245e" fillOpacity={0.25} />
                )}
                {syntheseApres && (
                  <Radar name="Après" dataKey="Après" stroke="#f2901e" fill="#f2901e" fillOpacity={0.3} />
                )}
                <Tooltip formatter={(v: number) => `${Number(v).toFixed(1)}/4`} />
                {syntheseAvant && syntheseApres && <Legend wrapperStyle={{ fontSize: 11 }} />}
              </RadarChart>
            </ResponsiveContainer>
          </div>
        );

        return (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-700">📊 Synthèse questionnaire de positionnement</p>
              <p className="text-[11px] text-gray-400">
                {syntheseAvant ? `Avant : ${syntheseAvant.nbRepondants} réponse${syntheseAvant.nbRepondants > 1 ? "s" : ""}` : ""}
                {syntheseAvant && syntheseApres ? " · " : ""}
                {syntheseApres ? `Après : ${syntheseApres.nbRepondants} réponse${syntheseApres.nbRepondants > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {radarCompetences && radar("Compétences", radarCompetences)}
              {radarObjectifs && radar("Objectifs", radarObjectifs)}
            </div>
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
                <tr key={s.id} className={`border-b border-gray-50 ${allSigned ? "bg-green-50" : ""}`}>
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
                    <button
                      className="disabled:cursor-default"
                      disabled={s.doc_questionnaire_avant !== "signe"}
                      onClick={() => voirReponses(s, "avant")}
                      title={s.doc_questionnaire_avant === "signe" ? "Voir les réponses" : undefined}
                    >
                      <Badge className={`text-xs px-1.5 py-0.5 ${questAvant.color} ${s.doc_questionnaire_avant === "signe" ? "cursor-pointer hover:opacity-75" : ""}`}>{questAvant.label}</Badge>
                    </button>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge className={`text-xs px-1.5 py-0.5 ${emargement.color}`}>{emargement.label}</Badge>
                  </td>
                  <td className="py-2 pr-2">
                    <button
                      className="disabled:cursor-default"
                      disabled={s.doc_questionnaire_apres !== "signe"}
                      onClick={() => voirReponses(s, "apres")}
                      title={s.doc_questionnaire_apres === "signe" ? "Voir les réponses" : undefined}
                    >
                      <Badge className={`text-xs px-1.5 py-0.5 ${questApres.color} ${s.doc_questionnaire_apres === "signe" ? "cursor-pointer hover:opacity-75" : ""}`}>{questApres.label}</Badge>
                    </button>
                  </td>
                  <td className="py-2 pr-2">
                    {attestations[s.id] ? (
                      <button className="cursor-pointer" onClick={() => voirAttestation(s.id)} title="Voir l'attestation">
                        <Badge className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 hover:opacity-75">Générée ✓</Badge>
                      </button>
                    ) : envoye_par === "formateur" ? (
                      <Button
                        size="sm" variant="outline" className="h-6 text-xs px-2"
                        disabled={generatingAttestation === s.id}
                        onClick={() => genererAttestation(s)}
                      >
                        {generatingAttestation === s.id ? "..." : "🎓 Générer"}
                      </Button>
                    ) : (
                      <Badge className={`text-xs px-1.5 py-0.5 ${attestation.color}`}>{attestation.label}</Badge>
                    )}
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
                            {motifs.map(m => (
                              <DropdownMenuItem key={m.value} onClick={() => handleRelance(s, m.value)} className="text-xs cursor-pointer">{m.label}</DropdownMenuItem>
                            ))}
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
                    <td colSpan={9} className="py-2 px-0">
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
        <span>📝 Q. après complété : {stagiaires.filter(s => s.doc_questionnaire_apres === "signe").length}/{stagiaires.length}</span>
        <span>🎓 Attestations générées : {stagiaires.filter(s => attestations[s.id]).length}/{stagiaires.length}</span>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">
        Opt-in ✉️/📱 : ✓ accepté · ✗ refusé · – pas encore répondu (consentement RGPD recueilli sur le questionnaire de positionnement)
      </p>
    </div>
  );
};

export default StagiairesList;
