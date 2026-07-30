import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPES = ["chaud", "formateur", "froid"] as const;
type EvalType = typeof TYPES[number];

const LABELS: Record<EvalType, string> = {
  chaud: "Évaluation à chaud",
  formateur: "Évaluation du formateur",
  froid: "Évaluation à froid",
};

// Edge Function publique (pas d'authentification) : même principe que
// positionnement-public — le token, généré côté formateur (StagiairesList.tsx),
// fait office d'autorisation, on utilise donc la clé service_role pour
// contourner la RLS. Un seul point d'entrée pour les 3 questionnaires
// d'évaluation (chaud / formateur / froid), le token indique lequel.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, token, reponses } = await req.json();
    if (!token) throw new Error("token requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Le token peut correspondre à l'un des 3 types d'évaluation : on cherche
    // dans l'ordre jusqu'à trouver une correspondance.
    let stagiaire: Record<string, unknown> | null = null;
    let type: EvalType | null = null;
    for (const t of TYPES) {
      const { data } = await supabase
        .from("stagiaires")
        .select(`id, prenom, nom, session_id, doc_evaluation_${t}, reponses_evaluation_${t}`)
        .eq(`token_evaluation_${t}`, token)
        .maybeSingle();
      if (data) {
        stagiaire = data as Record<string, unknown>;
        type = t;
        break;
      }
    }
    if (!stagiaire || !type) throw new Error("Lien invalide ou expiré. Contactez votre formateur.");

    const docStatusField = `doc_evaluation_${type}`;
    const reponsesField = `reponses_evaluation_${type}`;

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("formation_id, formation:formation_id(titre, organismes(raison_sociale, logo_url))")
      .eq("id", stagiaire.session_id)
      .single();

    if (sErr || !session) throw new Error("Session introuvable.");
    const formationId = (session as Record<string, unknown>).formation_id as string;
    const formationInfo = (session as Record<string, unknown>).formation as Record<string, unknown>;
    const org = (formationInfo?.organismes as Record<string, string>) || {};

    if (action === "submit") {
      if (stagiaire[docStatusField] === "signe") {
        throw new Error("Ce questionnaire a déjà été complété. Merci !");
      }
      if (!reponses || typeof reponses !== "object") {
        throw new Error("Merci de répondre au questionnaire avant d'envoyer.");
      }

      const { error: updErr } = await supabase
        .from("stagiaires")
        .update({
          [docStatusField]: "signe",
          [reponsesField]: { ...reponses, submitted_at: new Date().toISOString() },
        })
        .eq("id", stagiaire.id);

      if (updErr) throw new Error("Erreur enregistrement : " + updErr.message);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action "get" (par défaut) : renvoyer les infos nécessaires pour afficher le formulaire
    const { data: q } = await supabase
      .from("evaluation_questions")
      .select("questions")
      .eq("formation_id", formationId)
      .eq("type", type)
      .maybeSingle();

    const dejaComplete = stagiaire[docStatusField] === "signe";

    return new Response(
      JSON.stringify({
        success: true,
        type,
        titre_questionnaire: LABELS[type],
        deja_complete: dejaComplete,
        stagiaire_prenom: stagiaire.prenom,
        stagiaire_nom: stagiaire.nom,
        formation_titre: (formationInfo?.titre as string) || "",
        organisme_raison_sociale: org.raison_sociale || "",
        organisme_logo_url: org.logo_url || "",
        questions: q?.questions || [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("evaluation-public: ERREUR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});