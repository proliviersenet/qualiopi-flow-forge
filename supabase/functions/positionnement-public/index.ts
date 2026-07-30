import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Edge Function publique (pas d'authentification) : le stagiaire n'a pas de compte
// QalioFlex. L'accès est protégé uniquement par un token unique et non devinable
// (généré par envoyer-relance) associé à un seul stagiaire et un seul type de
// questionnaire (avant/après). On utilise la clé service_role pour contourner la
// RLS ici — c'est le token, pas une session Supabase, qui fait office d'autorisation.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, token, competences_notes, objectifs_notes, consentement_email, consentement_sms } = await req.json();
    if (!token) throw new Error("token requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Le token peut correspondre au questionnaire "avant" ou "après" du stagiaire.
    // On récupère aussi l'état courant du consentement RGPD (opt-in email/SMS) :
    // affiché pré-rempli côté formulaire, et comparé lors du submit pour ne
    // journaliser un nouveau consentement que si le choix change réellement.
    const { data: stagAvant } = await supabase
      .from("stagiaires")
      .select("id, prenom, nom, session_id, doc_questionnaire_avant, reponses_questionnaire_avant, consentement_email, consentement_sms")
      .eq("token_questionnaire_avant", token)
      .maybeSingle();

    const { data: stagApres } = stagAvant ? { data: null } : await supabase
      .from("stagiaires")
      .select("id, prenom, nom, session_id, doc_questionnaire_apres, reponses_questionnaire_apres, consentement_email, consentement_sms")
      .eq("token_questionnaire_apres", token)
      .maybeSingle();

    const stagiaire = stagAvant || stagApres;
    const type: "avant" | "apres" = stagAvant ? "avant" : "apres";
    if (!stagiaire) throw new Error("Lien invalide ou expiré. Contactez votre formateur.");

    const docStatusField = type === "avant" ? "doc_questionnaire_avant" : "doc_questionnaire_apres";
    const reponsesField = type === "avant" ? "reponses_questionnaire_avant" : "reponses_questionnaire_apres";

    // Formation + organisme (pour le logo et les infos de l'organisme, comme sur
    // les autres documents générés) via session -> formation -> organisme.
    const { data: session, error: sErr } = await supabase
      .from("sessions")
      .select("formation_id, formation:formation_id(titre, organismes(raison_sociale, logo_url))")
      .eq("id", (stagiaire as Record<string, unknown>).session_id)
      .single();

    if (sErr || !session) throw new Error("Session introuvable.");
    const formationId = (session as Record<string, unknown>).formation_id as string;
    const formationInfo = (session as Record<string, unknown>).formation as Record<string, unknown>;
    const org = (formationInfo?.organismes as Record<string, string>) || {};

    if (action === "submit") {
      const s = stagiaire as Record<string, unknown>;
      if (s[docStatusField] === "signe") {
        throw new Error("Ce questionnaire a déjà été complété. Merci !");
      }

      // Consentement RGPD opt-in email/SMS : obligatoire, un choix explicite
      // (accepté ou refusé, jamais une valeur par défaut) doit être fourni pour
      // chaque canal avant tout enregistrement — c'est le mécanisme d'opt-in
      // exigé par Brevo pour l'envoi email/SMS.
      if (typeof consentement_email !== "boolean" || typeof consentement_sms !== "boolean") {
        throw new Error("Merci d'indiquer vos préférences de contact (email et SMS) avant d'envoyer.");
      }

      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        [docStatusField]: "signe",
        [reponsesField]: { competences: competences_notes || {}, objectifs: objectifs_notes || {}, submitted_at: now },
      };

      // On ne journalise (et on ne met à jour la date) que si le choix change
      // réellement par rapport à l'état courant — évite de dupliquer l'historique
      // à chaque soumission si le stagiaire n'a rien modifié.
      const logsToInsert: { stagiaire_id: string; canal: string; accepte: boolean; ip: string | null; user_agent: string | null }[] = [];
      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      const userAgent = req.headers.get("user-agent") || null;

      if (s.consentement_email !== consentement_email) {
        updates.consentement_email = consentement_email;
        updates.consentement_email_date = now;
        logsToInsert.push({ stagiaire_id: s.id as string, canal: "email", accepte: consentement_email, ip: clientIp, user_agent: userAgent });
      }
      if (s.consentement_sms !== consentement_sms) {
        updates.consentement_sms = consentement_sms;
        updates.consentement_sms_date = now;
        logsToInsert.push({ stagiaire_id: s.id as string, canal: "sms", accepte: consentement_sms, ip: clientIp, user_agent: userAgent });
      }

      const { error: updErr } = await supabase
        .from("stagiaires")
        .update(updates)
        .eq("id", s.id);

      if (updErr) throw new Error("Erreur enregistrement : " + updErr.message);

      if (logsToInsert.length > 0) {
        const { error: logErr } = await supabase.from("consentements_log").insert(logsToInsert);
        // Le consentement lui-même est déjà enregistré sur le stagiaire ci-dessus ;
        // un échec de journalisation ne doit pas faire échouer la soumission du
        // questionnaire, mais on le trace pour investigation.
        if (logErr) console.error("positionnement-public: échec journalisation consentement:", logErr.message);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action "get" (par défaut) : renvoyer les infos nécessaires pour afficher le formulaire
    const { data: comp } = await supabase
      .from("formation_competences")
      .select("competences, objectifs")
      .eq("formation_id", formationId)
      .maybeSingle();

    const s = stagiaire as Record<string, unknown>;
    const dejaComplete = s[docStatusField] === "signe";

    return new Response(
      JSON.stringify({
        success: true,
        type,
        deja_complete: dejaComplete,
        stagiaire_prenom: s.prenom,
        stagiaire_nom: s.nom,
        formation_titre: (formationInfo?.titre as string) || "",
        organisme_raison_sociale: org.raison_sociale || "",
        organisme_logo_url: org.logo_url || "",
        competences: comp?.competences || [],
        objectifs: comp?.objectifs || [],
        consentement_email: s.consentement_email ?? null,
        consentement_sms: s.consentement_sms ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("positionnement-public: ERREUR:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});