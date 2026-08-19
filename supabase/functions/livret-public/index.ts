import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "consultation directe livret/attestation" (19/08/2026) : jusqu'ici le
// stagiaire ne pouvait consulter son livret d'accueil que via son espace client
// (compte requis) — écart hors-périmètre identifié lors du test E2E du 14/08.
// Edge Function publique (pas d'authentification), même principe que
// emargement-public / support-public : le token_livret du stagiaire fait office
// de clé d'autorisation, on utilise la clé service_role pour contourner la RLS
// après avoir localisé le stagiaire par ce token.
//
// Le livret est propre à la SESSION (pas au stagiaire) : documents_formation
// est donc interrogé par session_id + type='livret', comme le fait déjà
// generer-livret/index.ts et EspaceClient.tsx (documentsBySession).
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
      .select("id, prenom, session_id")
      .eq("token_livret", token)
      .maybeSingle();

    if (sErr) throw new Error("Erreur lecture stagiaire : " + sErr.message);
    if (!stagiaire) throw new Error("Lien invalide ou expiré.");

    const s = stagiaire as Record<string, unknown>;

    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select("formation:formation_id(titre)")
      .eq("id", s.session_id as string)
      .maybeSingle();

    if (sessErr || !session) throw new Error("Session introuvable.");
    const formationInfo = (session as Record<string, unknown>).formation as Record<string, unknown> | null;
    const formationTitre = (formationInfo?.titre as string) || "votre formation";

    const { data: doc, error: docErr } = await supabase
      .from("documents_formation")
      .select("contenu_html, fichier_url")
      .eq("session_id", s.session_id as string)
      .eq("type", "livret")
      .maybeSingle();

    if (docErr) throw new Error("Erreur lecture livret : " + docErr.message);

    if (!doc || (!doc.contenu_html && !doc.fichier_url)) {
      throw new Error("Le livret d'accueil n'est pas encore disponible. Contactez votre formateur.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        prenom: s.prenom,
        formation_titre: formationTitre,
        contenu_html: doc.contenu_html ?? null,
        fichier_url: doc.fichier_url ?? null,
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
