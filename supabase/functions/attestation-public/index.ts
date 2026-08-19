import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "consultation directe livret/attestation" (19/08/2026) : jusqu'ici le
// stagiaire ne pouvait consulter son attestation de fin de formation que via son
// espace client (compte requis) — écart hors-périmètre identifié lors du test
// E2E du 14/08. Edge Function publique (pas d'authentification), même principe
// que emargement-public / livret-public : le token_attestation du stagiaire
// (migration 20260819100000) fait office de clé d'autorisation.
//
// L'attestation est propre au STAGIAIRE (pas à la session, contrairement au
// livret) : documents_formation est donc interrogé par stagiaire_id +
// type='attestation', comme le fait déjà generer-attestation/index.ts.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) throw new Error("token requis");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stagiaire, error: sErr } = await supabase
      .from("stagiaires")
      .select("id, prenom")
      .eq("token_attestation", token)
      .maybeSingle();

    if (sErr) throw new Error("Erreur lecture stagiaire : " + sErr.message);
    if (!stagiaire) throw new Error("Lien invalide ou expiré.");

    const s = stagiaire as Record<string, unknown>;

    const { data: doc, error: docErr } = await supabase
      .from("documents_formation")
      .select("contenu_html")
      .eq("stagiaire_id", s.id as string)
      .eq("type", "attestation")
      .maybeSingle();

    if (docErr) throw new Error("Erreur lecture attestation : " + docErr.message);
    if (!doc?.contenu_html) {
      throw new Error("Votre attestation n'est pas encore disponible. Contactez votre formateur.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        prenom: s.prenom,
        contenu_html: doc.contenu_html,
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
