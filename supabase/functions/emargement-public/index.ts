import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier 5 : Edge Function publique (pas d'authentification) pour la
// signature de la feuille d'émargement par le stagiaire, sur le même principe
// que positionnement-public / evaluation-public — le token fait office
// d'autorisation, on utilise donc la clé service_role pour contourner la RLS.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, token, nom_signataire } = await req.json();
    if (!token) throw new Error("token requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stagiaire, error: sErr } = await supabase
      .from("stagiaires")
      .select(`
        id, prenom, nom, doc_emargement, doc_questionnaire_avant,
        sessions:session_id ( date_debut, date_fin, lieu, formations:formation_id ( titre ) )
      `)
      .eq("token_emargement", token)
      .maybeSingle();

    if (sErr) throw new Error("Erreur lecture stagiaire : " + sErr.message);
    if (!stagiaire) throw new Error("Lien invalide ou expiré.");

    const s = stagiaire as Record<string, unknown>;
    const session = s.sessions as Record<string, unknown> | null;
    const formation = session?.formations as Record<string, unknown> | null;

    if (action === "submit") {
      if (s.doc_emargement === "signe") {
        throw new Error("Cette feuille d'émargement a déjà été signée. Merci !");
      }
      // Chantier 5 : le questionnaire avant formation doit être complété avant
      // toute signature d'émargement (exigence Qualiopi — adaptation du
      // parcours avant le démarrage effectif).
      if (s.doc_questionnaire_avant !== "signe") {
        throw new Error(
          "Le questionnaire de positionnement avant formation doit être complété avant de signer l'émargement."
        );
      }
      if (!nom_signataire || typeof nom_signataire !== "string" || !nom_signataire.trim()) {
        throw new Error("Merci de saisir votre nom pour valider la signature.");
      }

      const { error: updErr } = await supabase
        .from("stagiaires")
        .update({
          doc_emargement: "signe",
          doc_emargement_signe_le: new Date().toISOString(),
        })
        .eq("id", s.id);

      if (updErr) throw new Error("Erreur enregistrement : " + updErr.message);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // action "get" (par défaut) : renvoyer les infos nécessaires pour afficher la page
    return new Response(
      JSON.stringify({
        prenom: s.prenom,
        nom: s.nom,
        formation_titre: formation?.titre ?? "votre formation",
        date_debut: session?.date_debut ?? null,
        date_fin: session?.date_fin ?? null,
        lieu: session?.lieu ?? null,
        deja_signe: s.doc_emargement === "signe",
        questionnaire_avant_complete: s.doc_questionnaire_avant === "signe",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
