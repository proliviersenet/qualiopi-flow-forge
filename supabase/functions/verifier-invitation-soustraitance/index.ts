import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chantier "sous-traitance" (28/08) : lecture publique (avant inscription, donc pas
// encore de JWT) d'une invitation de sous-traitance par token — affiche le contexte
// ("X vous invite à co-animer Y") sur /register?st=<token> avant que le formateur crée
// son compte. Pas de policy RLS publique ajoutée sur sessions_sous_traitance pour ça :
// tout passe par cette fonction en service role (surface d'exposition minimale).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "token requis" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: invitation, error } = await supabase
      .from("sessions_sous_traitance")
      .select("email_invite, expires_at, organisme_demandeur_id, session:session_id(formation:formation_id(titre))")
      .eq("token", token)
      .eq("statut", "invite")
      .gte("expires_at", new Date().toISOString())
      .single();

    if (error || !invitation) {
      return new Response(JSON.stringify({ valid: false, error: "Invitation invalide ou expirée." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: organisme } = await supabase
      .from("organismes")
      .select("raison_sociale")
      .eq("id", invitation.organisme_demandeur_id)
      .maybeSingle();

    const formationTitre = (invitation.session as unknown as { formation?: { titre?: string } } | null)?.formation?.titre || "une formation";

    return new Response(
      JSON.stringify({
        valid: true,
        email_invite: invitation.email_invite,
        formation_titre: formationTitre,
        organisme_demandeur_nom: organisme?.raison_sociale || "Un formateur QalioFlex",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Erreur verifier-invitation-soustraitance:", err);
    return new Response(
      JSON.stringify({ valid: false, error: err instanceof Error ? err.message : "Erreur interne" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
