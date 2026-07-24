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
      toast({ title: "Erreur génération attestation", description: message, variant:
