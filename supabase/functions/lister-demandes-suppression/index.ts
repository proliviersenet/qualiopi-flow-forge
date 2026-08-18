import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Seul ce compte (Olivier, propriétaire de QalioFlex) est autorisé à
// consulter les demandes de suppression en cours.
const ADMIN_EMAIL = "olivier@exsenco.fr";
const FENETRE_JOURS = 30;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
      return new Response(
        JSON.stringify({ error: "Action réservée à l'administrateur QalioFlex." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: demandes, error: fetchErr } = await admin
      .from("demandes_suppression_compte")
      .select("id, email, avec_recuperation, mode_paiement, demandee_le, relance_j5_envoyee, relance_j15_envoyee, notif_olivier_envoyee")
      .is("restauree_le", null)
      .is("supprimee_definitivement_le", null)
      .order("demandee_le", { ascending: true });

    if (fetchErr) {
      console.error("Erreur lecture demandes_suppression_compte:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Erreur serveur lors de la lecture des demandes." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const enrichies = (demandes ?? []).map((d) => {
      const jours = Math.floor((Date.now() - new Date(d.demandee_le).getTime()) / (1000 * 60 * 60 * 24));
      return { ...d, jours_ecoules: jours, jours_restants: Math.max(0, FENETRE_JOURS - jours) };
    });

    return new Response(
      JSON.stringify({ demandes: enrichies }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erreur lister-demandes-suppression:", e);
    return new Response(
      JSON.stringify({ error: "Erreur serveur." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
