import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-veille-secret",
};

// Veille documentaire Qualiopi (référentiel national qualité) : appelée une fois
// par mois par une tâche planifiée externe après vérification de la page
// officielle du référentiel. Enregistre systématiquement une ligne dans
// veille_qualiopi_log (que le référentiel ait changé ou non), afin que la page
// /qualiopi-statut affiche toujours une date de "dernier contrôle" à jour.
// La tâche planifiée n'ayant pas de JWT utilisateur, l'accès est protégé par un
// secret partagé (x-veille-secret), même principe que x-cron-secret ailleurs.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const VEILLE_SECRET = Deno.env.get("VEILLE_QUALIOPI_SECRET") ?? "";
    const provided = req.headers.get("x-veille-secret") ?? "";
    if (!VEILLE_SECRET || provided !== VEILLE_SECRET) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { version_referentiel, date_maj_referentiel, statut, resume, lien_pdf } = body ?? {};

    if (!version_referentiel || !statut || !["inchange", "changement_detecte"].includes(statut)) {
      return new Response(
        JSON.stringify({ error: "version_referentiel et statut ('inchange' | 'changement_detecte') sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from("veille_qualiopi_log")
      .insert({
        version_referentiel,
        date_maj_referentiel: date_maj_referentiel ?? null,
        statut,
        resume: resume ?? null,
        lien_pdf: lien_pdf ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, log: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur veille-qualiopi-log:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erreur inconnue" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
