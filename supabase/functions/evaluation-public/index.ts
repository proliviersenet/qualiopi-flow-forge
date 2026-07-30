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
// positionnement-public — le token, généré côté formateur (StagiairesList.tsx)
// ou automatiquement (relance-eval-formateur-auto / relance-eval-froid-auto),
// fait office d'autorisation, on utilise donc la clé service_role pour
// contourner la RLS. Un seul point d'entrée pour les 3 questionnaires
// d'évaluation stagiaire (chaud / formateur / froid) ET pour l'évaluation du
// formateur remplie par le CLIENT (module de notation des formateurs,
// juillet 2026) — le token indique de quelle table/ligne il s'agit. Les
// champs de réponse (destinataire_prenom/nom) sont volontairement génériques
// pour être partagés entre stagiaire et client sur la même page publique
// (src/pages/EvaluationPublic.tsx).
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

    // 1) On cherche d'abord côté stagiaires (3 types possibles).
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

    // 2) Si aucun stagiaire ne correspond, on cherche côté client (le token
    //    n'existe alors que pour le type "formateur").
    let evalClient: Record<string, unknown> | null = null;
    let client: Record<string, unknown> | null = null;
    if (!stagiaire) {
      const { data: ec } = await supabase
        .from("evaluations_formateur_clients")
        .select("id, session_id, client_id, statut, reponses")
        .eq("token", token)
        .maybeSingle();
      if (ec) {
        evalClient = ec as Record<string, unknown>;
        type = "formateur";
        const { data: c } = await supabase
          .from("clients")
          .select("contact_nom, raison_sociale")
          .eq("id", (ec as Record<string, unknown>).client_id as string)
          .maybeSingle();
        client = c as Record<string, unknown> | null;
      }
    }

    if ((!stagiaire && !evalClient) || !type) {
      throw new Error("Lien invalide ou expiré. Contactez votre formateur.");
    }

    const sessionId = (stagiaire?.session_id ?? evalClient?.session_id) as string;

    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("formation_id, formation:formation_id(titre, organismes(raison_sociale, logo_url))")
      .eq("id", sessionId)
      .single();

    if (sErr || !session) throw new Error("Session introuvable.");
    const formationId = (session as Record<string, unknown>).formation_id as string;
    const formationInfo = (session as Record<string, unknown>).formation as Record<string, unknown>;
    const org = (formationInfo?.organismes as Record<string, string>) || {};

    const destinatairePrenom = stagiaire ? (stagiaire.prenom as string) : ((client?.contact_nom as string) || (client?.raison_sociale as string) || "");
    const destinataireNom = stagiaire ? (stagiaire.nom as string) : "";

    if (action === "submit") {
      if (!reponses || typeof reponses !== "object") {
        throw new Error("Merci de répondre au questionnaire avant d'envoyer.");
      }

      if (stagiaire) {
        const docStatusField = `doc_evaluation_${type}`;
        const reponsesField = `reponses_evaluation_${type}`;
        if (stagiaire[docStatusField] === "signe") {
          throw new Error("Ce questionnaire a déjà été complété. Merci !");
        }
        const { error: updErr } = await supabase
          .from("stagiaires")
          .update({
            [docStatusField]: "signe",
            [reponsesField]: { ...reponses, submitted_at: new Date().toISOString() },
          })
          .eq("id", stagiaire.id);
        if (updErr) throw new Error("Erreur enregistrement : " + updErr.message);
      } else if (evalClient) {
        if (evalClient.statut === "signe") {
          throw new Error("Ce questionnaire a déjà été complété. Merci !");
        }
        const { error: updErr } = await supabase
          .from("evaluations_formateur_clients")
          .update({
            statut: "signe",
            reponses: { ...reponses, submitted_at: new Date().toISOString() },
          })
          .eq("id", evalClient.id);
        if (updErr) throw new Error("Erreur enregistrement : " + updErr.message);
      }

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

    const dejaComplete = stagiaire
      ? stagiaire[`doc_evaluation_${type}`] === "signe"
      : evalClient?.statut === "signe";

    return new Response(
      JSON.stringify({
        success: true,
        type,
        titre_questionnaire: LABELS[type],
        deja_complete: dejaComplete,
        destinataire_prenom: destinatairePrenom,
        destinataire_nom: destinataireNom,
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
